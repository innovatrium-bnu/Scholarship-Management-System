import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequiresCapability } from "@/components/scholarship/RequiresCapability";
import { toast } from "sonner";
import { reportFailure } from "@/lib/api/failure";
import { PageHeader } from "@/components/scholarship/AppShell";
import { useStore } from "@/lib/scholarship/store";
import { ScholarshipForm } from "@/components/scholarship/ScholarshipForm";
import { HowTo } from "@/components/scholarship/guidance";

export const Route = createFileRoute("/scholarships/create")({
  component: GuardedCreateScholarshipPage,
  head: () => ({
    meta: [
      { title: "Add a scholarship | BNU Scholarships" },
      {
        name: "description",
        content: "Set up a new scholarship: who it is for, what it pays, and how it runs.",
      },
    ],
  }),
});

function CreateScholarshipPage() {
  const { addScholarship } = useStore();
  const nav = useNavigate();

  return (
    <>
      <PageHeader
        back={{ to: "/scholarships", label: "All scholarships" }}
        title="Add a scholarship"
        subtitle="Five short steps. Creating it does not give it to anybody. You do that afterwards from Give to students."
      />
      <div className="space-y-6 px-6 py-6 lg:px-8">
        <HowTo
          id="scholarship-create"
          intro="You will answer five questions, one screen at a time. Each screen tells you what it needs and whether anything on it is compulsory."
          steps={[
            {
              title: "Name it",
              body: "What it is called, one line about who it is for, and whether BNU or a donor pays.",
            },
            {
              title: "Say who it is for",
              body: "Which schools, programmes, and batches may be considered. Leave it open for the whole university.",
            },
            {
              title: "Say what it pays",
              body: "One line per fee. This is the only compulsory part besides the name.",
            },
            {
              title: "Add conditions, then the running details",
              body: "What a student must do to get it and keep it, then how often it is rechecked and any limit on numbers.",
            },
          ]}
          footer="The panel on the right fills in as you go, so you can always see what you have built so far. Creating the scholarship does not give it to anybody. Do that afterwards from “Give to students”."
        />

        <ScholarshipForm
          isEdit={false}
          onCancel={() => nav({ to: "/scholarships" })}
          onSubmit={async (data, reason) => {
            try {
              await addScholarship(data, reason);
            } catch (error) {
              reportFailure(error, `${data.name} was not created.`);

              return;
            }

            toast.success(`${data.name} created. You can now give it to students.`);
            nav({ to: "/scholarships" });
          }}
        />
      </div>
    </>
  );
}

/**
 * The permission boundary for this screen, applied before it renders.
 *
 * The sidebar hides this destination from roles that cannot use it, but a
 * URL is reachable regardless of what the menu shows. See
 * RequiresCapability for why the message arrives here rather than at save.
 */
function GuardedCreateScholarshipPage() {
  return (
    <RequiresCapability needs="scholarships.edit" what="add or change a scholarship">
      <CreateScholarshipPage />
    </RequiresCapability>
  );
}
