export type NavItem = {
  label: string;
  to: string;
};

export const mainNavItems: NavItem[] = [
  { label: 'Dashboard', to: '/app' },
  { label: 'Teams', to: '/teams' },
  { label: 'Games', to: '/games' },
];
