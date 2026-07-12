-- Aggregate stats per course for the My Courses grid: "3 sessions · 142
-- questions" + the freshness stamp ("Updated <month year>"). Runs as owner so
-- counts include premium content (aggregates only — no content leaks).

create view public.course_stats as
select
  c.id as course_id,
  count(distinct qs.id) as sets_count,
  count(distinct qs.session_id) as sessions_count,
  count(q.id) as questions_count,
  greatest(max(qs.created_at), max(m.created_at)) as updated_at
from public.courses c
left join public.question_sets qs on qs.course_id = c.id
left join public.questions q on q.question_set_id = qs.id
left join public.materials m on m.course_id = c.id
group by c.id;

grant select on public.course_stats to authenticated;
