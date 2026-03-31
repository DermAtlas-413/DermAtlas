/// <reference lib="dom" />

export function useImageCapture(onImageSelected: (uri: string) => void) {
  function pickFromCamera() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        onImageSelected(URL.createObjectURL(file));
      }
    };
    input.click();
  }

  function pickFromLibrary() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        onImageSelected(URL.createObjectURL(file));
      }
    };
    input.click();
  }

  return { pickFromCamera, pickFromLibrary };
}
