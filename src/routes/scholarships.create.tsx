import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { ScholarshipForm } from "@/components/scholarship/ScholarshipForm";

export const Route = createFileRoute("/scholarships/create")({
  component: CreateScholarshipPage,
  head: () => ({
    meta: [
      { title: "Create scholarship — BNU" },
      { name: "description", content: "Define eligibility, coverage, and governance for a new scholarship." },
    ],
  }),
});

function CreateScholarshipPage() {
  const { addScholarship } = useStore();
  const nav = useNavigate();

  return (
    <>
      <PageHeader
        title="Create scholarship"
        subtitle="Define eligibility, coverage, and governance. You can assign it to students once it's created."
      />
      <div className="px-8 py-6">
        <ScholarshipForm
          isEdit={false}
          onCancel={() => nav({ to: "/scholarships" })}
          onSubmit={(data, reason) => {
            addScholarship(data, reason);
            toast.success(`${data.name} created`);
            nav({ to: "/scholarships" });
          }}
        />
      </div>
    </>
  );
}
