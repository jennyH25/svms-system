import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

function LegalPageLayout({ eyebrow, title, intro, sections = [] }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_34%),linear-gradient(180deg,#09090b_0%,#111318_100%)] text-white">
      <div className="mx-auto max-w-4xl px-6 py-8 sm:px-8 lg:px-10">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to="/login"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back</span>
          </Link>
          <div className="text-left text-[11px] uppercase tracking-[0.28em] text-gray-500 sm:text-right">
            Student Violation Management System
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 shadow-2xl backdrop-blur sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-300 sm:text-base">
            {intro}
          </p>

          <div className="mt-10 space-y-8">
            {sections.map((section) => (
              <section
                key={section.heading}
                className="rounded-3xl border border-white/8 bg-black/20 p-6"
              >
                <h2 className="text-lg font-bold text-white">
                  {section.heading}
                </h2>
                <p className="mt-3 text-sm leading-7 text-gray-300 sm:text-base">
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LegalPageLayout;
