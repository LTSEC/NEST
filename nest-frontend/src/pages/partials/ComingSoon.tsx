import React from 'react';

type ComingSoonProps = {
  title: string;
  description?: string;
};

const ComingSoon: React.FC<ComingSoonProps> = ({ title, description }) => (
  <section className="animate-fade-in rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
    <div className="mx-auto max-w-md text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-indigo-500 dark:text-indigo-400">
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h1>
      {description && <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
  </section>
);

export default ComingSoon;
