import { create } from "zustand";

export type EntityType = "company" | "responsible";

interface EntityDrawerState {
  isOpen: boolean;
  entityType: EntityType | null;
  entityId: string | null;

  open: (type: EntityType, id: string) => void;
  close: () => void;
}

export const useEntityDrawerStore = create<EntityDrawerState>((set) => ({
  isOpen: false,
  entityType: null,
  entityId: null,

  open: (type, id) =>
    set({
      isOpen: true,
      entityType: type,
      entityId: id,
    }),

  close: () =>
    set({
      isOpen: false,
      entityType: null,
      entityId: null,
    }),
}));
