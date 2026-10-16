import React, { useEffect } from 'react';

export function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with 12px blur per DESIGN.md */}
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Surface (Tier 3) */}
      <div className={`relative bg-white rounded-4xl shadow-floating w-full ${maxWidth} z-10 overflow-hidden transform transition-all`}>
        <div className="px-6 pt-6 flex items-center justify-between">
          <h2 className="text-2xl text-on-surface">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
