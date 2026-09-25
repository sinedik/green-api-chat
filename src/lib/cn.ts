import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Склейка классов с разрешением конфликтов Tailwind: переданный снаружи `h-9` побеждает базовый `h-11` */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes))
}
