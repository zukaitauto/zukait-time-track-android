(function(){'use strict';
function display(value){return String(value??'').trim().replace(/\s+/g,' ').toUpperCase()}
function key(value){return display(value).normalize('NFKC').replace(/[^A-Z0-9]/g,'')}
function same(a,b){const x=key(a),y=key(b);return !!x&&x===y}
function matches(value,query){const v=key(value),q=key(query);return !!q&&v.includes(q)}
window.zukaitRegistration={display,key,same,matches};
window.zukaitRegistrationKey=key;
})();
