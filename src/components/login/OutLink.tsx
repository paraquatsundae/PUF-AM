import type { ReactNode } from 'react';

export function OutLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="underline font-medium" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
