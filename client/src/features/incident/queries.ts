'use client';
import { useMutation } from '@tanstack/react-query';

import { createIncident } from './api';
export function useCreateIncident() {
  return useMutation({ mutationFn: createIncident });
}
