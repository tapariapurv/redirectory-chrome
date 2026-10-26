// Built-in "Quick tasks" list shown in the focus panel. Stored locally.
import { get, set, onChange, uid } from '../lib/store.js';
import { h, icon } from '../lib/ui.js';

export function mountTasks(root) {
  let tasks = [];
  let editingId = null;

  const input = h('input', {
    class: 'input tasks-input',
    placeholder: 'Add a task and press Enter',
    maxlength: '200',
    'aria-label': 'New task',
  });
  const list = h('ul', { class: 'tasks-list', role: 'list' });
  const count = h('span', { class: 'tasks-count' });
  const clearBtn = h('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: clearDone }, 'Clear done');
  const empty = h(
    'div',
    { class: 'tasks-empty' },
    h('div', { class: 'tasks-empty-title' }, 'What would make today a win?'),
    h('div', { class: 'tasks-empty-sub' }, 'Write down the one thing you came online to do. Then do that instead.')
  );

  root.replaceChildren(
    h(
      'div',
      { class: 'tasks' },
      h(
        'div',
        { class: 'tasks-head' },
        h('div', {}, h('h2', { class: 'tasks-title' }, 'Today'), count),
        clearBtn
      ),
      h(
        'form',
        {
          class: 'tasks-form',
          onsubmit: (e) => {
            e.preventDefault();
            add(input.value);
          },
        },
        h('span', { class: 'tasks-plus' }, icon('plus')),
        input
      ),
      empty,
      list
    )
  );

  async function save(next) {
    tasks = next;
    render();
    await set({ tasks: next });
  }

  function add(text) {
    const t = text.trim();
    if (!t) return;
    input.value = '';
    save([{ id: uid(), text: t, done: false, createdAt: Date.now() }, ...tasks]);
  }

  function toggle(id) {
    const next = tasks.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: t.done ? null : Date.now() } : t));
    save(next);
  }

  function remove(id) {
    save(tasks.filter((t) => t.id !== id));
  }

  function rename(id, text) {
    const t = text.trim();
    editingId = null;
    if (!t) return remove(id);
    save(tasks.map((x) => (x.id === id ? { ...x, text: t } : x)));
  }

  function clearDone() {
    save(tasks.filter((t) => !t.done));
  }

  function render() {
    const open = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    count.textContent = tasks.length
      ? open.length
        ? `${open.length} to go${done.length ? ` · ${done.length} done` : ''}`
        : `All ${done.length} done. Nice.`
      : '';
    clearBtn.hidden = !done.length;
    empty.hidden = tasks.length > 0;

    list.replaceChildren(
      ...[...open, ...done].map((t) => {
        const text =
          editingId === t.id
            ? h('input', {
                class: 'task-edit',
                value: t.text,
                maxlength: '200',
                onkeydown: (e) => {
                  if (e.key === 'Enter') e.target.blur();
                  if (e.key === 'Escape') {
                    editingId = null;
                    render();
                  }
                  e.stopPropagation();
                },
                onblur: (e) => rename(t.id, e.target.value),
              })
            : h(
                'span',
                {
                  class: 'task-text',
                  title: 'Double-click to edit',
                  ondblclick: () => {
                    editingId = t.id;
                    render();
                  },
                },
                t.text
              );
        return h(
          'li',
          { class: 'task' + (t.done ? ' done' : ''), dataset: { id: t.id } },
          h(
            'button',
            {
              class: 'task-check',
              type: 'button',
              'aria-label': t.done ? 'Mark as not done' : 'Mark as done',
              onclick: () => toggle(t.id),
            },
            icon('check')
          ),
          text,
          h(
            'button',
            { class: 'icon-btn danger task-del', type: 'button', 'aria-label': 'Delete task', onclick: () => remove(t.id) },
            icon('x')
          )
        );
      })
    );
    const editor = list.querySelector('.task-edit');
    if (editor) {
      editor.focus();
      editor.select();
    }
  }

  get('tasks').then((t) => {
    tasks = t;
    render();
  });
  onChange(['tasks'], (c) => {
    if (editingId) return;
    tasks = c.tasks.newValue || [];
    render();
  });

  return { focus: () => input.focus() };
}
