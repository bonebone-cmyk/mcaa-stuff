export const NAV = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/scores', label: 'Scores', icon: 'scores' },
  { href: '/schedule', label: 'Schedule', icon: 'schedule' },
  { href: '/teams', label: 'Teams', icon: 'teams' },
  { href: '/conferences', label: 'Conferences', icon: 'conferences' },
  { href: '/rankings', label: 'Rankings', icon: 'rankings' },
  { href: '/recruiting', label: 'Recruiting', icon: 'recruiting' },
  { href: '/players', label: 'Players', icon: 'players' },
  { href: '/stats', label: 'Statistics', icon: 'stats' },
  { href: '/playoffs', label: 'Playoffs', icon: 'playoffs' },
  { href: '/news', label: 'News & Lore', icon: 'news' },
  { href: '/history', label: 'History', icon: 'history' },
  { href: '/my-team', label: 'My Team', icon: 'myteam', requires: 'user' },
  { href: '/commissioner', label: 'Commissioner Panel', icon: 'commissioner', requires: 'commissioner' },
] as const;

export const MOBILE_PRIMARY = ['/', '/scores', '/rankings', '/recruiting'];
