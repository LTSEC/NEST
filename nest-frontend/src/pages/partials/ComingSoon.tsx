import React from 'react';

type ComingSoonProps = {
  title: string;
  description?: string;
};

const ComingSoon: React.FC<ComingSoonProps> = ({ title, description }) => (
  <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
    {description && <p className="mt-2 text-sm text-slate-600">{description}</p>}
  </section>
);

export default ComingSoon;
