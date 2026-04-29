import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PreviewScanPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

export default async function PreviewScanPage({ params }: PreviewScanPageProps) {
  const { scanId } = await params;
  redirect(`/scan/${scanId}`);
}
