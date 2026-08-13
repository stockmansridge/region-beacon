import React from "react";

const URL_REGEX_GLOBAL = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

function isLink(part: string): boolean {
  return /^(https?:\/\/|www\.)/.test(part);
}

function hrefFor(part: string): string {
  return part.startsWith("http") ? part : `https://${part}`;
}

function isValidUrl(part: string): boolean {
  try {
    new URL(hrefFor(part));
    return true;
  } catch {
    return false;
  }
}

export function LinkifyText({ text }: { text: string }) {
  const parts = text.split(URL_REGEX_GLOBAL);
  return (
    <>
      {parts.map((part, idx) => {
        if (isLink(part) && isValidUrl(part)) {
          return (
            <a
              key={idx}
              href={hrefFor(part)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--event-primary,#1F3D2B)] underline underline-offset-2 hover:opacity-80"
            >
              {part}
            </a>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </>
  );
}
