const UPPERCASE_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "tel",
  "url",
  "password",
]);

/**
 * Convierte a mayúsculas el contenido de inputs de texto y textareas antes
 * de que los onChange particulares de cada formulario actualicen su estado.
 * No modifica fechas, números, archivos, checks ni selects.
 */
export function uppercaseTextFieldOnChange(event) {
  const field = event?.target;
  if (!field) return;

  const tagName = String(field.tagName || "").toUpperCase();
  const isTextarea = tagName === "TEXTAREA";
  const isTextInput =
    tagName === "INPUT" &&
    UPPERCASE_INPUT_TYPES.has(String(field.type || "text").toLowerCase());

  if (!isTextarea && !isTextInput) return;

  const currentValue = String(field.value ?? "");
  const uppercaseValue = currentValue.toLocaleUpperCase("es-AR");
  if (currentValue === uppercaseValue) return;

  const selectionStart = field.selectionStart;
  const selectionEnd = field.selectionEnd;
  field.value = uppercaseValue;

  if (
    selectionStart !== null &&
    selectionEnd !== null &&
    typeof field.setSelectionRange === "function"
  ) {
    requestAnimationFrame(() => {
      try {
        field.setSelectionRange(selectionStart, selectionEnd);
      } catch {
        // Algunos tipos de input no permiten controlar la selección.
      }
    });
  }
}
