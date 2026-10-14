"use client";

import React, { Children, Fragment, isValidElement, useContext, type ReactNode } from "react";
import { SiteIntegritySiteContext } from "./site-integrity-evidence";

function flattenBoxes(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap(child =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? flattenBoxes(child.props.children) : [child]);
}

/** Balance visible boxes by count while keeping each column independently expandable. */
export function EvidenceColumns({ children, siteIntegrity, hasSiteIntegrity }: {
  children: ReactNode;
  siteIntegrity?: ReactNode;
  hasSiteIntegrity?: boolean;
}) {
  const site = useContext(SiteIntegritySiteContext);
  const showIntegrity = site ? site.findings.length > 0 : hasSiteIntegrity;
  const boxes = flattenBoxes(<>{showIntegrity ? siteIntegrity : null}{children}</>);
  const leftCount = Math.ceil(boxes.length / 2);
  return <>{[boxes.slice(0, leftCount), boxes.slice(leftCount)].map((column, index) =>
    <div key={index} className="evidence-directory-column min-w-0 border-l border-t border-zinc-200">
      {column.map((box, boxIndex) => <Fragment key={boxIndex}>{box}</Fragment>)}
    </div>)}
  </>;
}
