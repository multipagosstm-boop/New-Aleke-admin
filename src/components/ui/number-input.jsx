import * as React from "react";
import { Input } from "@/components/ui/input";

/**
 * Input numérico controlado que permite campos vacíos mientras se edita.
 * Expone siempre un número al padre (0 cuando está vacío).
 * Resuelve el problema de los inputs type="number" que al hacer
 * Number(value) || 0 no dejan borrar el 0 inicial.
 */
const NumberInput = React.forwardRef(({ value, onChange, defaultValue, ...props }, ref) => {
  const isEmpty = value === undefined || value === null || value === "";
  const [text, setText] = React.useState(isEmpty ? "" : String(value));

  React.useEffect(() => {
    const incoming = value === undefined || value === null || value === "" ? 0 : Number(value);
    if (Number.isNaN(incoming)) return;
    const current = text === "" ? 0 : Number(text);
    if (Number.isNaN(current) && text !== "") return;
    if (current !== incoming) {
      setText(value === undefined || value === null || value === "" ? "" : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e) => {
    const v = e.target.value;
    setText(v);
    if (v === "") {
      onChange?.(0);
    } else {
      const n = Number(v);
      if (!Number.isNaN(n)) onChange?.(n);
    }
  };

  return <Input ref={ref} type="number" value={text} onChange={handleChange} {...props} />;
});
NumberInput.displayName = "NumberInput";

export { NumberInput };