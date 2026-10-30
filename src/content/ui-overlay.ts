import { FieldMatchResult, UnansweredQuestion } from '../types/engine';

export class UIOverlay {
  private static toastElement: HTMLElement | null = null;
  private static modalElement: HTMLElement | null = null;

  /**
   * Shows a floating summary toast at the bottom-right of the page.
   */
  public static showToast(
    filledCount: number,
    reviewCount: number,
    unansweredCount: number = 0,
    onReviewClick?: () => void,
    onClearClick?: () => void,
    onAnswerClick?: () => void
  ): void {
    this.removeToast();

    const toast = document.createElement('div');
    toast.id = 'job-autofill-toast';

    toast.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:16px;">⚡</span>
        <div>
          <div class="toast-title">Job Autofill</div>
          <div class="toast-stats">
            <span class="stat-filled">✓ ${filledCount} filled</span>
            ${reviewCount > 0 ? `<span class="stat-review">⚠ ${reviewCount} review</span>` : ''}
            ${unansweredCount > 0 ? `<span class="stat-review" style="color:#8b5cf6; background:none;">💡 ${unansweredCount} new questions</span>` : ''}
          </div>
        </div>
      </div>
      <div style="display:flex; gap:6px; margin-left:12px;">
        ${
          unansweredCount > 0 && onAnswerClick
            ? `<button id="btn-toast-answer" class="toast-btn toast-btn-primary" style="background:#7c3aed; border-color:#6d28d9;">Answer (${unansweredCount})</button>`
            : ''
        }
        ${
          reviewCount > 0
            ? `<button id="btn-toast-review" class="toast-btn toast-btn-primary">Review</button>`
            : ''
        }
        <button id="btn-toast-clear" class="toast-btn">Clear</button>
        <button id="btn-toast-close" class="toast-btn" style="padding:4px 8px;">✕</button>
      </div>
    `;

    document.body.appendChild(toast);
    this.toastElement = toast;

    // Attach listeners
    toast.querySelector('#btn-toast-close')?.addEventListener('click', () => {
      this.removeToast();
    });

    toast.querySelector('#btn-toast-clear')?.addEventListener('click', () => {
      if (onClearClick) onClearClick();
      this.removeToast();
    });

    if (unansweredCount > 0 && onAnswerClick) {
      toast.querySelector('#btn-toast-answer')?.addEventListener('click', () => {
        onAnswerClick();
      });
    }

    if (reviewCount > 0 && onReviewClick) {
      toast.querySelector('#btn-toast-review')?.addEventListener('click', () => {
        onReviewClick();
      });
    }

    // Auto dismiss after 15 seconds if no unanswered questions or reviews needed
    if (reviewCount === 0 && unansweredCount === 0) {
      setTimeout(() => {
        this.removeToast();
      }, 10000);
    }
  }

  public static removeToast(): void {
    if (this.toastElement && this.toastElement.parentElement) {
      this.toastElement.parentElement.removeChild(this.toastElement);
      this.toastElement = null;
    }
  }

  /**
   * Displays the interactive Preview modal showing detected fields, confidence, and values.
   */
  public static showPreviewModal(
    matches: FieldMatchResult[],
    onApply: (approvedMatches: FieldMatchResult[]) => void
  ): void {
    this.removeModal();

    const overlay = document.createElement('div');
    overlay.id = 'job-autofill-modal-overlay';

    const rowsHtml = matches
      .map((m, index) => {
        const confClass =
          m.confidenceLevel === 'high'
            ? 'confidence-high'
            : m.confidenceLevel === 'medium'
            ? 'confidence-medium'
            : 'confidence-low';

        const confPercent = Math.round(m.confidence * 100);
        const isChecked = m.suggestedAction === 'fill';

        const isBoolean = typeof m.targetValue === 'boolean';
        const valuePreview = isBoolean
          ? m.targetValue
            ? 'Yes / Checked'
            : 'No / Unchecked'
          : String(m.targetValue ?? '');

        // The control carries the full value: it is read back on Apply, so a
        // shortened display string would be written into the form. Multi-line
        // values need a textarea because <input type="text"> strips line breaks.
        const valueStyle = 'width:100%; font-size:12px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;';
        const valueControl = valuePreview.includes('\n')
          ? `<textarea class="modal-val-input" data-index="${index}" rows="2" style="${valueStyle} resize:vertical;">${this.escapeHtml(valuePreview)}</textarea>`
          : `<input type="text" class="modal-val-input" data-index="${index}" value="${this.escapeHtml(valuePreview)}" title="${this.escapeHtml(valuePreview)}" ${isBoolean ? 'readonly' : ''} style="${valueStyle} text-overflow:ellipsis;" />`;

        return `
          <tr data-index="${index}">
            <td style="width:30px; text-align:center;">
              <input type="checkbox" class="modal-field-checkbox" data-index="${index}" ${
                isChecked ? 'checked' : ''
              } />
            </td>
            <td style="font-weight:600; color:#1e293b;">
              ${this.escapeHtml(m.displayLabel || m.detectedField.labelText || m.detectedField.name)}
              <div style="font-size:11px; color:#64748b; font-weight:normal;">${this.escapeHtml(
                m.matchReason
              )}</div>
            </td>
            <td>
              ${valueControl}
            </td>
            <td style="text-align:center;">
              <span class="confidence-pill ${confClass}">${confPercent}%</span>
            </td>
            <td style="text-align:right;">
              <button class="toast-btn btn-jump-to" data-index="${index}" title="Scroll to element on page">🔍 View</button>
            </td>
          </tr>
        `;
      })
      .join('');

    overlay.innerHTML = `
      <div id="job-autofill-modal">
        <div class="modal-header">
          <div class="modal-title">
            <span>⚡</span>
            <span>Autofill Preview (${matches.length} fields detected)</span>
          </div>
          <button id="modal-close-btn" class="toast-btn" style="border:none; background:none; font-size:16px;">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:12px; color:#64748b; margin-top:0; margin-bottom:12px;">
            Review and adjust values below. Click any row to jump and highlight that field on the page.
          </p>
          <table class="modal-table">
            <thead>
              <tr>
                <th style="width:30px;"><input type="checkbox" id="modal-select-all" ${
                  matches.length > 0 && matches.every((m) => m.suggestedAction === 'fill') ? 'checked' : ''
                } /></th>
                <th>Field</th>
                <th>Value to Fill</th>
                <th style="text-align:center;">Confidence</th>
                <th style="text-align:right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <span style="font-size:12px; color:#64748b;">Local-First & Private • Zero Data Transmitted</span>
          <div style="display:flex; gap:8px;">
            <button id="modal-cancel-btn" class="toast-btn">Cancel</button>
            <button id="modal-apply-btn" class="toast-btn toast-btn-primary">Apply Selected</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalElement = overlay;

    // Jump to field handler
    overlay.querySelectorAll('.btn-jump-to').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((btn as HTMLElement).getAttribute('data-index') || '0', 10);
        this.scrollToAndPulseField(matches[idx]?.detectedField.element);
      });
    });

    // Row click jump
    overlay.querySelectorAll('tbody tr').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (['INPUT', 'TEXTAREA', 'BUTTON'].includes((e.target as HTMLElement).tagName)) return;
        const idx = parseInt((row as HTMLElement).getAttribute('data-index') || '0', 10);
        this.scrollToAndPulseField(matches[idx]?.detectedField.element);
      });
    });

    // Select all toggle
    const selectAll = overlay.querySelector('#modal-select-all') as HTMLInputElement;
    selectAll?.addEventListener('change', () => {
      overlay.querySelectorAll('.modal-field-checkbox').forEach((cb) => {
        (cb as HTMLInputElement).checked = selectAll.checked;
      });
    });

    // Close buttons
    overlay.querySelector('#modal-close-btn')?.addEventListener('click', () => this.removeModal());
    overlay.querySelector('#modal-cancel-btn')?.addEventListener('click', () => this.removeModal());

    // Apply button
    overlay.querySelector('#modal-apply-btn')?.addEventListener('click', () => {
      const approved: FieldMatchResult[] = [];
      overlay.querySelectorAll('.modal-field-checkbox').forEach((cb) => {
        const input = cb as HTMLInputElement;
        if (input.checked) {
          const idx = parseInt(input.getAttribute('data-index') || '0', 10);
          const editedValInput = overlay.querySelector(`.modal-val-input[data-index="${idx}"]`) as HTMLInputElement | HTMLTextAreaElement;
          const matchItem = matches[idx];
          if (matchItem) {
            if (editedValInput && (typeof matchItem.targetValue === 'string' || typeof matchItem.targetValue === 'number')) {
              matchItem.targetValue = editedValInput.value;
            }
            // Ticking a row is the user's approval; the fill step only acts on 'fill'.
            matchItem.suggestedAction = 'fill';
            approved.push(matchItem);
          }
        }
      });

      this.removeModal();
      onApply(approved);
    });
  }

  public static removeModal(): void {
    if (this.modalElement && this.modalElement.parentElement) {
      this.modalElement.parentElement.removeChild(this.modalElement);
      this.modalElement = null;
    }
  }

  /**
   * Displays the interactive Question Assistant modal asking the user to answer unrecognized questions.
   */
  public static showQuestionAssistantModal(
    questions: UnansweredQuestion[],
    onSaveAndFill: (answers: { questionText: string; answer: string; fieldIds: string[] }[]) => void
  ): void {
    this.removeModal();

    const overlay = document.createElement('div');
    overlay.id = 'job-autofill-modal-overlay';

    const questionsHtml = questions
      .map((q, idx) => {
        let inputControlHtml = '';

        if (q.type === 'choice' && q.options && q.options.length > 0) {
          const isBinary = q.options.length <= 3 && q.options.every((o) => o.label.length <= 15);
          if (isBinary) {
            inputControlHtml = `
              <div style="display:flex; gap:12px; margin-top:6px;">
                ${q.options
                  .map(
                    (opt, optIdx) => `
                    <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:500; cursor:pointer;">
                      <input type="radio" name="qa-radio-${idx}" value="${this.escapeHtml(opt.value)}" ${optIdx === 0 ? 'checked' : ''} />
                      <span>${this.escapeHtml(opt.label)}</span>
                    </label>
                  `
                  )
                  .join('')}
              </div>
            `;
          } else {
            inputControlHtml = `
              <select class="qa-field-control" data-idx="${idx}" style="width:100%; font-size:13px; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:4px;">
                ${q.options
                  .map(
                    (opt) => `
                    <option value="${this.escapeHtml(opt.value)}">${this.escapeHtml(opt.label)}</option>
                  `
                  )
                  .join('')}
              </select>
            `;
          }
        } else if (q.type === 'boolean') {
          inputControlHtml = `
            <div style="margin-top:6px;">
              <label style="display:inline-flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
                <input type="checkbox" class="qa-field-control" data-idx="${idx}" />
                <span style="color:#334155;">Yes</span>
              </label>
            </div>
          `;
        } else if (q.type === 'textarea') {
          inputControlHtml = `
            <textarea class="qa-field-control" data-idx="${idx}" rows="2" placeholder="Enter your response..." style="width:100%; font-size:13px; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:4px; box-sizing:border-box;"></textarea>
          `;
        } else {
          // Normal text
          inputControlHtml = `
            <input type="text" class="qa-field-control" data-idx="${idx}" placeholder="Enter your response..." style="width:100%; font-size:13px; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:4px; box-sizing:border-box;" />
          `;
        }

        return `
          <div class="qa-question-card" data-idx="${idx}" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
              <span style="font-weight:600; font-size:13px; color:#1e293b; line-height:1.4;">
                ${idx + 1}. ${this.escapeHtml(q.questionText)}
              </span>
              <span style="font-size:11px; background:#ede9fe; color:#6d28d9; padding:2px 6px; border-radius:4px; font-weight:500; white-space:nowrap; margin-left:8px;">
                New Question
              </span>
            </div>
            ${inputControlHtml}
          </div>
        `;
      })
      .join('');

    overlay.innerHTML = `
      <div id="job-autofill-modal" style="max-width:550px;">
        <div class="modal-header">
          <div class="modal-title">
            <span>💡</span>
            <span>Question Assistant (${questions.length} New Questions)</span>
          </div>
          <button id="qa-modal-close-btn" class="toast-btn" style="border:none; background:none; font-size:16px;">✕</button>
        </div>
        <div class="modal-body" style="max-height:420px; overflow-y:auto; padding-right:4px;">
          <p style="font-size:12px; color:#64748b; margin-top:0; margin-bottom:12px;">
            Provide your answers below. The extension will <strong>fill the form immediately</strong> and <strong>save these answers</strong> to your profile so it automatically knows them for all future applications!
          </p>
          <div id="qa-cards-container">
            ${questionsHtml}
          </div>
        </div>
        <div class="modal-footer">
          <span style="font-size:11px; color:#64748b;">Saved 100% locally to your browser profile</span>
          <div style="display:flex; gap:8px;">
            <button id="qa-modal-cancel-btn" class="toast-btn">Cancel</button>
            <button id="qa-modal-save-btn" class="toast-btn toast-btn-primary" style="background:#7c3aed; border-color:#6d28d9;">Save & Fill All</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalElement = overlay;

    overlay.querySelector('#qa-modal-close-btn')?.addEventListener('click', () => this.removeModal());
    overlay.querySelector('#qa-modal-cancel-btn')?.addEventListener('click', () => this.removeModal());

    overlay.querySelector('#qa-modal-save-btn')?.addEventListener('click', () => {
      const answers: { questionText: string; answer: string; fieldIds: string[] }[] = [];

      questions.forEach((q, idx) => {
        let answerVal = '';

        if (q.type === 'choice' && q.options && q.options.length > 0) {
          const isBinary = q.options.length <= 3 && q.options.every((o) => o.label.length <= 15);
          if (isBinary) {
            const checkedRadio = overlay.querySelector(`input[name="qa-radio-${idx}"]:checked`) as HTMLInputElement;
            answerVal = checkedRadio ? checkedRadio.value : q.options[0].value;
          } else {
            const selectEl = overlay.querySelector(`select[data-idx="${idx}"]`) as HTMLSelectElement;
            answerVal = selectEl ? selectEl.value : '';
          }
        } else if (q.type === 'boolean') {
          const checkEl = overlay.querySelector(`input[data-idx="${idx}"][type="checkbox"]`) as HTMLInputElement;
          answerVal = checkEl && checkEl.checked ? 'true' : 'false';
        } else {
          const inputEl = overlay.querySelector(`.qa-field-control[data-idx="${idx}"]`) as HTMLInputElement | HTMLTextAreaElement;
          answerVal = inputEl ? inputEl.value.trim() : '';
        }

        if (answerVal) {
          answers.push({
            questionText: q.questionText,
            answer: answerVal,
            fieldIds: q.fieldIds
          });
        }
      });

      this.removeModal();
      onSaveAndFill(answers);
    });
  }

  private static learnedTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Brief note that a correction was learned, so the candidate can see the
   * extension is tracking their edits (and undo it in Settings if unwanted).
   */
  public static showLearnedNotice(
    label: string,
    value: string,
    scope: string,
    manageIn: string = 'Settings → Learned Corrections'
  ): void {
    document.getElementById('job-autofill-learned')?.remove();
    clearTimeout(this.learnedTimer);

    const shown = value ? (value.length > 40 ? value.substring(0, 37) + '...' : value) : '(leave empty)';
    const notice = document.createElement('div');
    notice.id = 'job-autofill-learned';
    notice.setAttribute('role', 'status');
    notice.style.cssText =
      'position:fixed; left:16px; bottom:16px; z-index:2147483646; max-width:360px; background:#1e293b; color:#f8fafc; font:12px/1.4 system-ui, sans-serif; padding:8px 12px; border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,.25);';
    const shownLabel = label.length > 60 ? label.substring(0, 57) + '...' : label;
    notice.innerHTML = `⚡ Learned for ${this.escapeHtml(scope)}: <strong>${this.escapeHtml(shownLabel)}</strong> → ${this.escapeHtml(shown)}<div style="opacity:.7; margin-top:2px;">Used next time. Manage in ${this.escapeHtml(manageIn)}.</div>`;
    document.body.appendChild(notice);
    this.learnedTimer = setTimeout(() => notice.remove(), 5000);
  }

  public static scrollToAndPulseField(el?: HTMLElement): void {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('job-autofill-pulse');
    setTimeout(() => {
      el.classList.remove('job-autofill-pulse');
    }, 2500);
  }

  private static escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
