import { getCertScoreSocialProfiles } from "../../lib/social";

export function SocialFollowLinks({ compact = false }: { compact?: boolean }) {
  const profiles = getCertScoreSocialProfiles();

  if (compact) {
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {profiles.map((profile) => (
          <a
            aria-label={`Follow CertScore.ai on ${profile.label}`}
            className="font-medium text-slate-600 transition hover:text-slate-950"
            href={profile.url}
            key={profile.label}
            rel="noopener noreferrer"
            target="_blank"
          >
            {profile.label}
          </a>
        ))}
      </div>
    );
  }

  const linkedIn = profiles.find((profile) => profile.label === "LinkedIn");
  const x = profiles.find((profile) => profile.label === "X");

  return (
    <p className="text-sm leading-7 text-slate-600">
      Follow CertScore.ai on{" "}
      {linkedIn ? (
        <>
          <a className="font-semibold text-sky-700 hover:text-sky-900" href={linkedIn.url} rel="noopener noreferrer" target="_blank">
            LinkedIn
          </a>{" "}
          and{" "}
        </>
      ) : null}
      {x ? (
        <a className="font-semibold text-sky-700 hover:text-sky-900" href={x.url} rel="noopener noreferrer" target="_blank">
          X
        </a>
      ) : null}{" "}
      for product updates.
    </p>
  );
}
