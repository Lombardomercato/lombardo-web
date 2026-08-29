-- Matching review is deliberately separate from image publication approval.
-- An operator may validate product identity without granting image rights.
alter table public.external_image_candidates
  add column match_review_status text not null default 'pending';

alter table public.external_image_candidates
  add constraint external_image_candidates_match_review_status_check
  check (match_review_status in ('pending', 'approved', 'rejected'));

create index external_image_candidates_match_review_queue_idx
  on public.external_image_candidates(match_review_status, match_confidence desc, created_at);
