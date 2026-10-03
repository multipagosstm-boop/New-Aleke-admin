// Inspired by react-hot-toast and shadcn/ui
import { useState, useEffect } from "react";

const TOAST_LIMIT = 3;
const TOAST_AUTO_DISMISS_DELAY = 5000; // 5 segundos de superposición antes de desaparecer automáticamente
const TOAST_REMOVE_DELAY = 600; // Tiempo para permitir la animación de salida antes de eliminar del estado

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
};

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_VALUE;
  return count.toString();
}

const toastAutoDismissTimeouts = new Map();
const toastRemoveTimeouts = new Map();

const addToRemoveQueue = (toastId) => {
  if (toastRemoveTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastRemoveTimeouts.delete(toastId);
    dispatch({
      type: actionTypes.REMOVE_TOAST,
      toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastRemoveTimeouts.set(toastId, timeout);
};

export const reducer = (state, action) => {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case actionTypes.UPDATE_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case actionTypes.DISMISS_TOAST: {
      const { toastId } = action;

      if (toastId) {
        if (toastAutoDismissTimeouts.has(toastId)) {
          clearTimeout(toastAutoDismissTimeouts.get(toastId));
          toastAutoDismissTimeouts.delete(toastId);
        }
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          if (toastAutoDismissTimeouts.has(toast.id)) {
            clearTimeout(toastAutoDismissTimeouts.get(toast.id));
            toastAutoDismissTimeouts.delete(toast.id);
          }
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    }
    case actionTypes.REMOVE_TOAST:
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
    default:
      return state;
  }
};

const listeners = [];

let memoryState = { toasts: [] };

function dispatch(action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

function toast({ ...props }) {
  const id = genId();

  const update = (newProps) =>
    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: { ...newProps, id },
    });

  const dismiss = () => {
    if (toastAutoDismissTimeouts.has(id)) {
      clearTimeout(toastAutoDismissTimeouts.get(id));
      toastAutoDismissTimeouts.delete(id);
    }
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });
  };

  const duration = props.duration !== undefined ? props.duration : TOAST_AUTO_DISMISS_DELAY;
  if (duration > 0 && duration !== Infinity) {
    const timer = setTimeout(() => {
      dismiss();
    }, duration);
    toastAutoDismissTimeouts.set(id, timer);
  }

  dispatch({
    type: actionTypes.ADD_TOAST,
    toast: {
      ...props,
      id,
      open: true,
      duration,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = useState(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId) => {
      if (toastId && toastAutoDismissTimeouts.has(toastId)) {
        clearTimeout(toastAutoDismissTimeouts.get(toastId));
        toastAutoDismissTimeouts.delete(toastId);
      }
      dispatch({ type: actionTypes.DISMISS_TOAST, toastId });
    },
  };
}

export { useToast, toast };