-- Enforce the presentation formats at the Storage API, including old clients.
-- Existing objects, ownership rules and account records are preserved.
do $$
begin
  update storage.buckets
  set allowed_mime_types = array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
  where id = 'presentations';
  if not found then
    raise exception 'The presentations storage bucket must exist before applying this restriction.';
  end if;
end $$;
