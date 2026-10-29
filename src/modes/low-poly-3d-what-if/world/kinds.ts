export const worldKinds = ['street', 'bathroom', 'portrait', 'suburb', 'city', 'terrain', 'globe', 'sun', 'space', 'explosion'] as const;
export type WorldKind = (typeof worldKinds)[number];
