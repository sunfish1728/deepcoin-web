// Follow Android TcTheme / TcComponents. Icons are the same filled Material set.
import home from '@material-design-icons/svg/filled/home.svg?raw';
import settings from '@material-design-icons/svg/filled/settings.svg?raw';
import back from '@material-design-icons/svg/filled/arrow_back.svg?raw';
import list from '@material-design-icons/svg/filled/list.svg?raw';
import add from '@material-design-icons/svg/filled/add.svg?raw';
import face from '@material-design-icons/svg/filled/face.svg?raw';
import person from '@material-design-icons/svg/filled/person.svg?raw';
import send from '@material-design-icons/svg/filled/send.svg?raw';
import next from '@material-design-icons/svg/filled/keyboard_arrow_right.svg?raw';
import refresh from '@material-design-icons/svg/filled/refresh.svg?raw';

const icons = { home, settings, back, list, add, face, person, send, next, refresh };
export const icon = name => icons[name].replace('<svg ', '<svg aria-hidden="true" fill="currentColor" ');
export const iconButton = (name, label, action, extra = '') => `<button class="icon-button" aria-label="${label}" title="${label}" data-action="${action}" ${extra}>${icon(name)}</button>`;
export const section = (label, content) => `<div class="panel settings-group"><div class="section-label">${label}</div><div class="group-content">${content}</div></div>`;
export const segmented = (name, options, value) => `<div class="segmented" role="group" aria-label="${name === 'theme' ? '主題' : '主頁預設鏡頭'}">${options.map(([v, label]) => `<button data-action="${name}" data-value="${v}" aria-pressed="${value === v}" class="${value === v ? 'selected' : ''}">${label}</button>`).join('')}</div>`;
export const switchRow = (name, title, subtitle, settings) => `<label class="switch-row"><span><span class="switch-title">${title}</span><span class="muted">${subtitle}</span></span><input type="checkbox" role="switch" aria-label="${title}" data-setting="${name}" ${settings[name] ? 'checked' : ''}></label>`;
