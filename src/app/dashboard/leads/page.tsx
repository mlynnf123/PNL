import { redirect } from 'next/navigation';

// Leads folded into the unified Pipeline (a lead is an early-stage job). This
// route is retired — anything here now lives on the Pipeline. The old
// leads-client / leads query remain in the tree during the one-release window
// while the leads table is kept read-only, but are no longer reachable in nav.
export default function LeadsPage() {
  redirect('/dashboard/jobs');
}
