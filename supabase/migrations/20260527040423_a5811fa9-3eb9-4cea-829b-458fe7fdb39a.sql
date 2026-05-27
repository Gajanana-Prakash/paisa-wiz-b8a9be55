
-- Enums
CREATE TYPE public.task_type AS ENUM ('GST_FILING','TDS_RETURN','ITR_FILING','AUDIT','BOOKKEEPING','NOTICE_REPLY','DOCUMENT_COLLECTION','OTHER');
CREATE TYPE public.task_priority AS ENUM ('LOW','MEDIUM','HIGH','URGENT');
CREATE TYPE public.task_status AS ENUM ('TODO','IN_PROGRESS','REVIEW','COMPLETED','CANCELLED');

-- tasks
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  client_id uuid,
  compliance_deadline_id uuid,
  title text NOT NULL,
  description text,
  task_type public.task_type NOT NULL DEFAULT 'OTHER',
  priority public.task_priority NOT NULL DEFAULT 'MEDIUM',
  assigned_to uuid,
  created_by uuid NOT NULL,
  due_date date,
  estimated_hours numeric(6,2),
  status public.task_status NOT NULL DEFAULT 'TODO',
  period_label text,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_rule text,
  parent_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_firm_status ON public.tasks(ca_firm_id, status);
CREATE INDEX idx_tasks_assigned ON public.tasks(assigned_to, status);
CREATE INDEX idx_tasks_client ON public.tasks(client_id);
CREATE INDEX idx_tasks_due ON public.tasks(due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_ca_firm_member(auth.uid(), ca_firm_id) AND created_by = auth.uid());
CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated
  USING (public.is_ca_firm_member(auth.uid(), ca_firm_id));
CREATE POLICY tasks_delete ON public.tasks FOR DELETE TO authenticated
  USING (public.is_ca_owner(auth.uid(), ca_firm_id));

CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- task_subtasks
CREATE TABLE public.task_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subtasks_task ON public.task_subtasks(task_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_subtasks TO authenticated;
GRANT ALL ON public.task_subtasks TO service_role;
ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY subtasks_select ON public.task_subtasks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_ca_firm_member(auth.uid(), t.ca_firm_id)));
CREATE POLICY subtasks_insert ON public.task_subtasks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_ca_firm_member(auth.uid(), t.ca_firm_id)));
CREATE POLICY subtasks_update ON public.task_subtasks FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_ca_firm_member(auth.uid(), t.ca_firm_id)));
CREATE POLICY subtasks_delete ON public.task_subtasks FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_ca_firm_member(auth.uid(), t.ca_firm_id)));
CREATE TRIGGER subtasks_set_updated_at BEFORE UPDATE ON public.task_subtasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- task_comments
CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_task ON public.task_comments(task_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY comments_select ON public.task_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_ca_firm_member(auth.uid(), t.ca_firm_id)));
CREATE POLICY comments_insert ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_ca_firm_member(auth.uid(), t.ca_firm_id)));
CREATE POLICY comments_delete ON public.task_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_ca_owner(auth.uid(), t.ca_firm_id)));

-- task_attachments
CREATE TABLE public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_task ON public.task_attachments(task_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_attachments TO authenticated;
GRANT ALL ON public.task_attachments TO service_role;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY attachments_select ON public.task_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_ca_firm_member(auth.uid(), t.ca_firm_id)));
CREATE POLICY attachments_insert ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_ca_firm_member(auth.uid(), t.ca_firm_id)));
CREATE POLICY attachments_delete ON public.task_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_ca_owner(auth.uid(), t.ca_firm_id)));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments','task-attachments', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "task_attachments_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND public.is_ca_firm_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "task_attachments_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-attachments'
    AND public.is_ca_firm_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "task_attachments_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND public.is_ca_firm_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
