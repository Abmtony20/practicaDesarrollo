const tablero = document.querySelector('#tablero');
const estado = document.querySelector('#estado');
const template = document.querySelector('#estudiante-template');

async function cargar() {
  try {
    const response = await fetch('/api/estudiantes');
    if (!response.ok) throw new Error('No se pudo consultar la API.');
    const estudiantes = await response.json();
    estado.textContent = `${estudiantes.length} estudiante(s) registrado(s)`;
    tablero.replaceChildren();
    if (!estudiantes.length) { tablero.textContent = 'Aún no hay registros.'; return; }
    for (const estudiante of estudiantes) {
      const card = template.content.cloneNode(true);
      card.querySelector('h2').textContent = estudiante.nombre;
      card.querySelector('.correo').textContent = `${estudiante.carnet} · ${estudiante.correo}`;
      card.querySelector('.avance').textContent = `${estudiante.completadas}/${estudiante.totalMisiones}`;
      card.querySelector('.barra span').style.width = `${estudiante.totalMisiones ? estudiante.completadas / estudiante.totalMisiones * 100 : 0}%`;
      const list = card.querySelector('.misiones');
      for (const mision of estudiante.misiones) {
        const item = document.createElement('li');
        item.className = mision.estado ? 'completa' : 'pendiente';
        item.textContent = `${mision.estado ? '✓' : '○'} ${mision.nombre}`;
        list.append(item);
      }
      tablero.append(card);
    }
  } catch (error) { estado.textContent = error.message; estado.classList.add('error'); }
}
cargar();
