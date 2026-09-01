-- final_course_reviews (added in 0016) had an RLS select policy but no
-- explicit GRANT — same bug class as 0009/0014: PostgREST requires an
-- explicit table-level grant in addition to RLS when "Automatically
-- expose new tables" is off.
grant select on public.final_course_reviews to authenticated;
