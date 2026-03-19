import { ValidationScansPage } from "../../../components/validation/scans-page";

type ScansPageProps = {
  searchParams?: Promise<{
    focusScanId?: string;
    page?: string;
    rankBand?: string;
    status?: string;
  }>;
};

export default function ScansPage({ searchParams }: ScansPageProps) {
  return <ValidationScansPage searchParams={searchParams} />;
}
