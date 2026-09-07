-- Ingestion commit: applies a parsed upload batch atomically.
-- Run in the Supabase SQL editor after schema.sql.
-- Called by the app with the service role; SECURITY DEFINER so it can write
-- sailings, sailing_history and audit_log in one transaction.

create or replace function public.commit_upload_batch(p_batch_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_batch upload_batches%rowtype;
  v_payload jsonb;
  v_ins jsonb;
  v_upd jsonb;
  v_rem jsonb;
  v_new_id uuid;
  v_old sailings%rowtype;
  v_field text;
  v_new_val text;
  v_old_val text;
  n_ins int := 0;
  n_upd int := 0;
  n_rem int := 0;
begin
  select * into v_batch from upload_batches where id = p_batch_id for update;
  if not found then
    raise exception 'Batch % not found', p_batch_id;
  end if;
  if v_batch.status <> 'awaiting_confirm' then
    raise exception 'Batch is % — only awaiting_confirm batches can be committed', v_batch.status;
  end if;
  v_payload := v_batch.parsed_payload;

  -- Inserts
  for v_ins in select * from jsonb_array_elements(coalesce(v_payload->'inserts', '[]'::jsonb))
  loop
    insert into sailings (carrier_id, vessel_id, voyage_no, pol_id, pod_id, mode, etd, eta, cy_cutoff, upload_batch_id)
    values (
      (v_ins->>'carrier_id')::uuid,
      (v_ins->>'vessel_id')::uuid,
      v_ins->>'voyage_no',
      (v_ins->>'pol_id')::uuid,
      (v_ins->>'pod_id')::uuid,
      v_ins->>'mode',
      (v_ins->>'etd')::timestamptz,
      (v_ins->>'eta')::timestamptz,
      (v_ins->>'cy_cutoff')::timestamptz
      , p_batch_id
    )
    returning id into v_new_id;
    insert into sailing_history (sailing_id, upload_batch_id, changed_field, old_value, new_value, change_type)
    values (v_new_id, p_batch_id, '*', null, v_ins->>'voyage_no', 'insert');
    n_ins := n_ins + 1;
  end loop;

  -- Updates: per-field before-images (feeds change alerts)
  for v_upd in select * from jsonb_array_elements(coalesce(v_payload->'updates', '[]'::jsonb))
  loop
    select * into v_old from sailings where id = (v_upd->>'id')::uuid;
    if not found then continue; end if;

    for v_field, v_new_val in select key, value #>> '{}' from jsonb_each(v_upd->'set')
    loop
      v_old_val := case v_field
        when 'etd' then v_old.etd::text
        when 'eta' then v_old.eta::text
        when 'cy_cutoff' then v_old.cy_cutoff::text
        when 'pod_id' then v_old.pod_id::text
        when 'mode' then v_old.mode
        else null
      end;
      if v_old_val is distinct from v_new_val then
        insert into sailing_history (sailing_id, upload_batch_id, changed_field, old_value, new_value, change_type)
        values (v_old.id, p_batch_id, v_field, v_old_val, v_new_val, 'update');
      end if;
    end loop;

    update sailings set
      etd = coalesce((v_upd->'set'->>'etd')::timestamptz, etd),
      eta = case when v_upd->'set' ? 'eta' then (v_upd->'set'->>'eta')::timestamptz else eta end,
      cy_cutoff = coalesce((v_upd->'set'->>'cy_cutoff')::timestamptz, cy_cutoff),
      pod_id = coalesce((v_upd->'set'->>'pod_id')::uuid, pod_id),
      mode = coalesce(v_upd->'set'->>'mode', mode),
      upload_batch_id = p_batch_id,
      updated_at = now()
    where id = v_old.id;
    n_upd := n_upd + 1;
  end loop;

  -- Removes: carrier-wide replace — the new file is authoritative
  for v_rem in select * from jsonb_array_elements(coalesce(v_payload->'removes', '[]'::jsonb))
  loop
    select * into v_old from sailings where id = (v_rem->>'id')::uuid;
    if not found then continue; end if;
    insert into sailing_history (sailing_id, upload_batch_id, changed_field, old_value, new_value, change_type)
    values (v_old.id, p_batch_id, '*', v_old.voyage_no, null, 'remove');
    delete from sailings where id = v_old.id;
    n_rem := n_rem + 1;
  end loop;

  update upload_batches set
    status = 'committed',
    rows_inserted = n_ins,
    rows_updated = n_upd,
    rows_removed = n_rem
  where id = p_batch_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (
    p_actor_id, 'Upload committed', 'upload_batch', p_batch_id::text,
    jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'removed', n_rem)
  );

  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'removed', n_rem);
end;
$$;

-- Service role only — never callable from the browser.
revoke execute on function public.commit_upload_batch(uuid, uuid) from public, anon, authenticated;
