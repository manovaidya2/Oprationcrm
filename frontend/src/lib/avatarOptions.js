export const AVATAR_OPTIONS = [
  { seed: 'mouse', label: 'Mouse', emoji: '🐭', bg: 'linear-gradient(135deg,#fce7f3,#c7d2fe)' },
  { seed: 'rabbit', label: 'Rabbit', emoji: '🐰', bg: 'linear-gradient(135deg,#fee2e2,#fef3c7)' },
  { seed: 'panda', label: 'Panda', emoji: '🐼', bg: 'linear-gradient(135deg,#f8fafc,#cbd5e1)' },
  { seed: 'fox', label: 'Fox', emoji: '🦊', bg: 'linear-gradient(135deg,#fed7aa,#fb7185)' },
  { seed: 'koala', label: 'Koala', emoji: '🐨', bg: 'linear-gradient(135deg,#e0f2fe,#94a3b8)' },
  { seed: 'tiger', label: 'Tiger', emoji: '🐯', bg: 'linear-gradient(135deg,#fde68a,#f97316)' },
  { seed: 'lion', label: 'Lion', emoji: '🦁', bg: 'linear-gradient(135deg,#fef3c7,#f59e0b)' },
  { seed: 'bear', label: 'Bear', emoji: '🐻', bg: 'linear-gradient(135deg,#fed7aa,#92400e)' },
  { seed: 'cat', label: 'Cat', emoji: '🐱', bg: 'linear-gradient(135deg,#fbcfe8,#fb923c)' },
  { seed: 'dog', label: 'Dog', emoji: '🐶', bg: 'linear-gradient(135deg,#fde68a,#a16207)' },
  { seed: 'owl', label: 'Owl', emoji: '🦉', bg: 'linear-gradient(135deg,#ddd6fe,#7c3aed)' },
  { seed: 'penguin', label: 'Penguin', emoji: '🐧', bg: 'linear-gradient(135deg,#dbeafe,#1e293b)' },
  { seed: 'monkey', label: 'Monkey', emoji: '🐵', bg: 'linear-gradient(135deg,#fed7aa,#b45309)' },
  { seed: 'unicorn', label: 'Unicorn', emoji: '🦄', bg: 'linear-gradient(135deg,#f5d0fe,#818cf8)' },
  { seed: 'dragon', label: 'Dragon', emoji: '🐲', bg: 'linear-gradient(135deg,#bbf7d0,#16a34a)' },
  { seed: 'frog', label: 'Frog', emoji: '🐸', bg: 'linear-gradient(135deg,#dcfce7,#22c55e)' },
  { seed: 'chick', label: 'Chick', emoji: '🐥', bg: 'linear-gradient(135deg,#fef9c3,#eab308)' },
  { seed: 'hamster', label: 'Hamster', emoji: '🐹', bg: 'linear-gradient(135deg,#ffedd5,#fb7185)' },
  { seed: 'wolf', label: 'Wolf', emoji: '🐺', bg: 'linear-gradient(135deg,#e2e8f0,#64748b)' },
  { seed: 'cowboy', label: 'Cowboy', emoji: '🤠', bg: 'linear-gradient(135deg,#fef3c7,#c2410c)' },
  { seed: 'wizard', label: 'Wizard', emoji: '🧙', bg: 'linear-gradient(135deg,#ede9fe,#6d28d9)' },
  { seed: 'ninja', label: 'Ninja', emoji: '🥷', bg: 'linear-gradient(135deg,#d1d5db,#111827)' },
  { seed: 'astronaut', label: 'Astronaut', emoji: '🧑‍🚀', bg: 'linear-gradient(135deg,#cffafe,#2563eb)' },
  { seed: 'robot', label: 'Robot', emoji: '🤖', bg: 'linear-gradient(135deg,#ccfbf1,#0f766e)' },
];

export function avatarForSeed(seed) {
  return AVATAR_OPTIONS.find(a => a.seed === seed) || AVATAR_OPTIONS[0];
}
