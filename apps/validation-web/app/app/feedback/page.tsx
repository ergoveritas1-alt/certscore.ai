import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { FeedbackForm } from "../../../components/feedback/feedback-form";
import { getDashboardContext } from "../../../server/auth";

export default async function FeedbackPage() {
  const { user } = await getDashboardContext();

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Feedback</h1>
        <p className="max-w-3xl text-slate-600">
          Send product feedback, bug reports, and workflow requests directly to Ben. Include as much context as you can.
        </p>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Send feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <FeedbackForm userEmail={user.email ?? "unknown-user@certscore.ai"} />
        </CardContent>
      </Card>
    </div>
  );
}
