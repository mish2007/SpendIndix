import { useEffect, useRef } from "react";

function Modal({
  isOpen,
  onClose,
  titleId,
  className = "",
  preventClose = false,
  children,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const handleClose = () => {
    if (isOpen && !preventClose) {
      onClose();
    }
  };

  const handleCancel = (event) => {
    if (preventClose) {
      event.preventDefault();
    } else {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={`finance-dialog${className ? ` ${className}` : ""}`}
      aria-labelledby={titleId}
      onClose={handleClose}
      onCancel={handleCancel}
      onClick={(event) => {
        if (event.target === event.currentTarget && !preventClose) {
          onClose();
        }
      }}
    >
      {children}
    </dialog>
  );
}

export default Modal;
