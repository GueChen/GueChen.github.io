let draggedCell = null;

function generateGrids() {
    document.querySelectorAll('.inline-grid').forEach(grid => {
      const size = parseInt(grid.getAttribute('data-size')) || 3;
      grid.style.gridTemplateColumns = `repeat(${size}, var(--cell-size))`;
      grid.style.gridTemplateRows = `repeat(${size}, var(--cell-size))`;
      grid.innerHTML = '';
  
      for (let i = 0; i < size * size; i++) {
        const cell = document.createElement('span');
        cell.classList.add('cell');
        cell.textContent = Math.floor(Math.random() * 10);
        cell.setAttribute('draggable', 'true');
  
        cell.addEventListener('click', () => {
          cell.classList.toggle('frozen');
        });
  
        // Drag logic
        cell.addEventListener('dragstart', () => {
          draggedCell = cell;
          cell.classList.add('dragging');
        });
  
        cell.addEventListener('dragend', () => {
          cell.classList.remove('dragging');
          draggedCell = null;
        });
  
        cell.addEventListener('dragover', (e) => e.preventDefault());
  
        cell.addEventListener('drop', () => {
          if (draggedCell && draggedCell !== cell) {
            const temp = cell.textContent;
            cell.textContent = draggedCell.textContent;
            draggedCell.textContent = temp;
          }
        });
  
        grid.appendChild(cell);
      }
    });
  }
  

function animateGrids() {
  document.querySelectorAll('.inline-grid .cell').forEach(cell => {
    if (!cell.classList.contains('frozen')) {
      cell.textContent = Math.floor(Math.random() * 10);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  generateGrids();
  //setInterval(animateGrids, 500);
});
