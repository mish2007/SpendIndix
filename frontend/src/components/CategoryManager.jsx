import { useState } from "react";
import Modal from "./Modal";
import {
  createCategory,
  deleteCategory,
  getFinanceErrorMessage,
  updateCategory,
} from "../lib/transactions";

function CategoryManager({
  isOpen,
  onClose,
  userId,
  categories,
  usageCounts,
  onChanged,
}) {
  const [type, setType] = useState("expense");
  const [name, setName] = useState("");
  const [addError, setAddError] = useState("");
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [rowError, setRowError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [busyId, setBusyId] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const resetForm = () => {
    setType("expense");
    setName("");
    setAddError("");
    setFormError("");
    setEditingId("");
    setEditingName("");
    setRowError("");
    setConfirmDeleteId("");
  };

  const handleClose = () => {
    if (isAdding || busyId) {
      return;
    }
    resetForm();
    onClose();
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setAddError("Enter a category name.");
      return;
    }
    if (trimmedName.length > 80) {
      setAddError("Category names can be up to 80 characters.");
      return;
    }

    setIsAdding(true);
    setAddError("");
    setFormError("");
    try {
      await createCategory(userId, { type, name: trimmedName });
      setName("");
      await onChanged();
    } catch (error) {
      console.error("Could not create category:", error);
      setFormError(
        getFinanceErrorMessage(
          error,
          "We could not add this category. Please try again.",
        ),
      );
    } finally {
      setIsAdding(false);
    }
  };

  const handleEdit = async (categoryId) => {
    const trimmedName = editingName.trim();
    if (!trimmedName) {
      setRowError("Enter a category name.");
      return;
    }
    if (trimmedName.length > 80) {
      setRowError("Category names can be up to 80 characters.");
      return;
    }

    setBusyId(categoryId);
    setRowError("");
    try {
      await updateCategory(categoryId, trimmedName);
      setEditingId("");
      setEditingName("");
      await onChanged();
    } catch (error) {
      console.error("Could not update category:", error);
      setRowError(
        getFinanceErrorMessage(
          error,
          "We could not update this category. Please try again.",
        ),
      );
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = async (categoryId) => {
    setBusyId(categoryId);
    setRowError("");
    try {
      await deleteCategory(categoryId);
      setConfirmDeleteId("");
      await onChanged();
    } catch (error) {
      console.error("Could not delete category:", error);
      setRowError(
        getFinanceErrorMessage(
          error,
          "We could not delete this category. Please try again.",
        ),
      );
    } finally {
      setBusyId("");
    }
  };

  const titleId = "category-manager-title";

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      titleId={titleId}
      className="category-dialog"
      preventClose={isAdding || Boolean(busyId)}
    >
      <div className="finance-dialog-header">
        <div>
          <p className="eyebrow">YOUR SPENDING LANGUAGE</p>
          <h2 id={titleId}>Manage categories</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close category manager"
          onClick={handleClose}
          disabled={isAdding || Boolean(busyId)}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <form className="category-add-form" onSubmit={handleAdd} noValidate>
        <div className="category-add-fields">
          <div className="finance-field">
            <label htmlFor="new-category-type">Type</label>
            <select
              id="new-category-type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              disabled={isAdding}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="finance-field">
            <label htmlFor="new-category-name">Category name</label>
            <input
              id="new-category-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setAddError("");
                setFormError("");
              }}
              className={addError ? "has-error" : ""}
              aria-invalid={Boolean(addError)}
              aria-describedby={addError ? "new-category-error" : undefined}
              disabled={isAdding}
            />
            {addError && (
              <p className="field-error" id="new-category-error">
                {addError}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="button-primary category-add-button"
            disabled={isAdding}
          >
            {isAdding ? "Adding..." : "Add category"}
          </button>
        </div>
        {formError && (
          <p className="form-error-banner" role="alert">
            {formError}
          </p>
        )}
      </form>

      <div className="category-list">
        {["expense", "income"].map((categoryType) => (
          <section
            key={categoryType}
            className="category-list-section"
            aria-labelledby={`categories-${categoryType}-title`}
          >
            <h3 id={`categories-${categoryType}-title`}>
              {categoryType === "expense" ? "Expense" : "Income"}
            </h3>
            <ul>
              {categories
                .filter((category) => category.type === categoryType)
                .map((category) => {
                  const usage = usageCounts.get(category.id) || {
                    transactions: 0,
                    recurring: 0,
                  };
                  const isCustom = !category.is_system;
                  const canDelete =
                    usage.transactions === 0 && usage.recurring === 0;

                  return (
                    <li key={category.id} className="category-list-item">
                      {editingId === category.id ? (
                        <div className="category-edit-row">
                          <input
                            aria-label={`Rename ${category.name}`}
                            value={editingName}
                            onChange={(event) => {
                              setEditingName(event.target.value);
                              setRowError("");
                            }}
                            disabled={busyId === category.id}
                          />
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => handleEdit(category.id)}
                            disabled={busyId === category.id}
                          >
                            {busyId === category.id ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              setEditingId("");
                              setRowError("");
                            }}
                            disabled={busyId === category.id}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="category-list-row">
                          <div>
                            <span className="category-name">
                              {category.name}
                            </span>
                            <span className="category-usage">
                              {usage.transactions} transactions
                              {usage.recurring
                                ? `, ${usage.recurring} recurring`
                                : ""}
                            </span>
                          </div>
                          {isCustom && (
                            <div className="category-row-actions">
                              {confirmDeleteId === category.id ? (
                                <>
                                  <span className="category-delete-confirm">
                                    Delete?
                                  </span>
                                  <button
                                    type="button"
                                    className="text-button is-danger"
                                    onClick={() => handleDelete(category.id)}
                                    disabled={busyId === category.id}
                                  >
                                    {busyId === category.id
                                      ? "Deleting..."
                                      : "Confirm"}
                                  </button>
                                  <button
                                    type="button"
                                    className="text-button"
                                    onClick={() => setConfirmDeleteId("")}
                                    disabled={busyId === category.id}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="text-button"
                                    onClick={() => {
                                      setEditingId(category.id);
                                      setEditingName(category.name);
                                      setRowError("");
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="text-button is-danger"
                                    onClick={() => {
                                      setConfirmDeleteId(category.id);
                                      setRowError("");
                                    }}
                                    disabled={!canDelete}
                                    title={
                                      canDelete
                                        ? "Delete category"
                                        : "Categories in use cannot be deleted"
                                    }
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {rowError && (editingId === category.id || confirmDeleteId === category.id) && (
                        <p className="field-error" role="alert">
                          {rowError}
                        </p>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}

export default CategoryManager;
