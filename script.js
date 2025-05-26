const map = L.map('map').setView([21.0285, 105.8542], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors, © CartoDB',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    let markers = [], routeLine = null;
    let computationHistory = [];
    let locations = [], results = [], distMatrix = [];

    function addAddressInput() {
      const addressList = document.getElementById('address-list');
      const div = document.createElement('div');
      div.className = 'address-item';
      div.innerHTML = `
        <input type="text" class="address-input" placeholder="Ví dụ: 1 Đại Cồ Việt, Hà Nội">
        <button class="delete-btn">Xóa</button>
      `;
      addressList.appendChild(div);
      const newInput = div.querySelector('.address-input');
      newInput.focus();
    }

    function removeAddress(button) {
      if (document.querySelectorAll('.address-item').length > 1) {
        button.parentElement.remove();
      }
    }

    document.getElementById('address-list').addEventListener('keypress', function(event) {
      if (event.key === 'Enter' && event.target.classList.contains('address-input')) {
        event.preventDefault();
        addAddressInput();
      }
    });

    async function geocode(address) {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
      const response = await fetch(url);
      const data = await response.json();
      if (!data.length) throw new Error(`Không tìm thấy tọa độ cho ${address}`);
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        display_name: data[0].display_name
      };
    }

    async function reverseGeocode(lat, lon) {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
      const response = await fetch(url);
      const data = await response.json();
      if (!data.display_name) throw new Error(`Không tìm thấy địa chỉ cho tọa độ ${lat}, ${lon}`);
      return data.display_name;
    }

    async function generateRandomAddresses() {
      const numAddressesInput = document.getElementById('num-addresses');
      const n = parseInt(numAddressesInput.value);
      if (isNaN(n) || n < 2) {
        document.getElementById('results').innerText = '❌ Vui lòng nhập số địa chỉ lớn hơn hoặc bằng 2.';
        return;
      }

      document.getElementById('results').innerText = '⏳ Đang tạo địa chỉ ngẫu nhiên...';

      try {
        const addressList = document.getElementById('address-list');
        addressList.innerHTML = '';
        const latMin = 20.97, latMax = 21.02;
        const lonMin = 105.78, lonMax = 105.85;
        const addresses = [];
        for (let i = 0; i < n; i++) {
          const lat = latMin + Math.random() * (latMax - latMin);
          const lon = lonMin + Math.random() * (lonMax - lonMin);
          const address = await reverseGeocode(lat, lon);
          addresses.push(address);
          const div = document.createElement('div');
          div.className = 'address-item';
          div.innerHTML = `
            <input type="text" class="address-input" value="${address}">
            <button class="delete-btn">Xóa</button>
          `;
          addressList.appendChild(div);
        }
        document.getElementById('results').innerText = `✅ Đã tạo ${n} địa chỉ ngẫu nhiên trong quận Thanh Xuân.`;
      } catch (err) {
        console.error(err);
        document.getElementById('results').innerText = '❌ Lỗi: ' + err.message;
      }
    }

    async function getDrivingDistance(lat1, lon1, lat2, lon2) {
      const routeUrl = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
      const response = await fetch(routeUrl);
      const data = await response.json();
      if (!data.routes.length) throw new Error('Không tìm thấy tuyến đường');
      return data.routes[0].distance / 1000;
    }

    async function drawRoute(coords) {
      if (routeLine) map.removeLayer(routeLine);
      const fullPath = [];
      for (let i = 0; i < coords.length - 1; i++) {
        const routeUrl = `https://router.project-osrm.org/route/v1/driving/${coords[i][1]},${coords[i][0]};${coords[i+1][1]},${coords[i+1][0]}?overview=full&geometries=geojson`;
        const response = await fetch(routeUrl);
        const data = await response.json();
        if (!data.routes.length) throw new Error('Không tìm thấy tuyến đường');
        const routeCoords = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
        fullPath.push(...routeCoords);
      }
      routeLine = L.polyline(fullPath, { 
        color: '#00DDEB', 
        weight: 5, 
        opacity: 0.8,
        shadowColor: '#00DDEB',
        shadowBlur: 15,
        shadowOffset: [0, 0]
      }).addTo(map);
      map.fitBounds(routeLine.getBounds());
    }

    function tspAntColonySystem(distMatrix, n) {
      const numAnts = 50;
      const iterations = 100;
      const alpha = 1.0; // Pheromone importance
      const beta = 2.0; // Distance importance
      const evaporation = 0.5; // Pheromone evaporation rate
      const q = 100; // Pheromone constant
      let pheromone = Array(n).fill().map(() => Array(n).fill(1.0));
      let bestPath = [];
      let bestCost = Infinity;

      function calculateProbability(from, unvisited) {
        const probs = [];
        let sum = 0;
        unvisited.forEach(to => {
          if (distMatrix[from][to] === 0) return;
          const prob = Math.pow(pheromone[from][to], alpha) * Math.pow(1.0 / distMatrix[from][to], beta);
          probs.push({ to, prob });
          sum += prob;
        });
        probs.forEach(p => p.prob /= sum);
        return probs;
      }

      function chooseNextCity(from, unvisited) {
        const probs = calculateProbability(from, unvisited);
        const r = Math.random();
        let sum = 0;
        for (const p of probs) {
          sum += p.prob;
          if (r <= sum) return p.to;
        }
        return probs[probs.length - 1].to;
      }

      for (let iter = 0; iter < iterations; iter++) {
        const antPaths = [];
        const antCosts = [];
        for (let ant = 0; ant < numAnts; ant++) {
          let path = [0];
          let cost = 0;
          const unvisited = new Set([...Array(n).keys()].slice(1));
          let current = 0;

          while (unvisited.size > 0) {
            const next = chooseNextCity(current, unvisited);
            path.push(next);
            cost += distMatrix[current][next];
            unvisited.delete(next);
            current = next;
          }

          antPaths.push(path);
          antCosts.push(cost);

          if (cost < bestCost) {
            bestCost = cost;
            bestPath = [...path];
          }
        }

        // Update pheromones
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            pheromone[i][j] *= (1 - evaporation);
          }
        }

        for (let ant = 0; ant < numAnts; ant++) {
          const path = antPaths[ant];
          const cost = antCosts[ant];
          for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];
            pheromone[from][to] += q / cost;
            pheromone[to][from] += q / cost;
          }
        }
      }

      return { path: bestPath, cost: bestCost };
    }

    function tspGeneticAlgorithm(distMatrix, n) {
      const populationSize = 100;
      const generations = 200;
      const mutationRate = 0.02;

      function createIndividual() {
        const path = [...Array(n).keys()].slice(1);
        for (let i = path.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [path[i], path[j]] = [path[j], path[i]];
        }
        return [0, ...path];
      }

      function calculateCost(path) {
        let cost = 0;
        for (let i = 0; i < path.length - 1; i++) {
          cost += distMatrix[path[i]][path[i + 1]];
        }
        return cost;
      }

      function crossover(parent1, parent2) {
        const start = Math.floor(Math.random() * (n - 1)) + 1;
        const end = start + Math.floor(Math.random() * (n - start)) + 1;
        const child = Array(n).fill(-1);
        child[0] = 0;
        for (let i = start; i <= end; i++) {
          child[i] = parent1[i];
        }
        let pos = 1;
        for (let i = 1; i < n; i++) {
          if (!child.includes(parent2[i])) {
            while (child[pos] !== -1) pos++;
            child[pos] = parent2[i];
          }
        }
        return child;
      }

      function mutate(individual) {
        if (Math.random() < mutationRate) {
          const i = Math.floor(Math.random() * (n - 1)) + 1;
          const j = Math.floor(Math.random() * (n - 1)) + 1;
          [individual[i], individual[j]] = [individual[j], individual[i]];
        }
        return individual;
      }

      let population = Array(populationSize).fill().map(() => createIndividual());
      let bestPath = population[0];
      let bestCost = calculateCost(bestPath);

      for (let gen = 0; gen < generations; gen++) {
        const fitness = population.map(individual => 1 / calculateCost(individual));
        const totalFitness = fitness.reduce((sum, f) => sum + f, 0);
        const probabilities = fitness.map(f => f / totalFitness);

        const newPopulation = [];
        for (let i = 0; i < populationSize; i++) {
          const parent1 = population[Math.floor(Math.random() * populationSize)];
          const parent2 = population[Math.floor(Math.random() * populationSize)];
          let child = crossover(parent1, parent2);
          child = mutate(child);
          newPopulation.push(child);

          const cost = calculateCost(child);
          if (cost < bestCost) {
            bestCost = cost;
            bestPath = [...child];
          }
        }
        population = newPopulation;
      }

      return { path: bestPath, cost: bestCost };
    }

    function tspBranchAndBound(distMatrix, n) {
      let minCost = Infinity;
      let bestPath = [];
      const path = [0];
      const visited = new Set([0]);
      function bound(curr, count, cost) {
        if (count === n) {
          if (cost < minCost) {
            minCost = cost;
            bestPath = [...path];
          }
          return;
        }
        for (let i = 0; i < n; i++) {
          if (!visited.has(i) && cost + distMatrix[curr][i] < minCost) {
            visited.add(i);
            path.push(i);
            bound(i, count + 1, cost + distMatrix[curr][i]);
            visited.delete(i);
            path.pop();
          }
        }
      }
      bound(0, 1, 0);
      return { path: bestPath, cost: minCost };
    }

    function tspGreedy(distMatrix, n) {
      const visited = new Set([0]);
      const path = [0];
      let cost = 0;
      let current = 0;
      while (visited.size < n) {
        let minDist = Infinity;
        let next = -1;
        for (let i = 0; i < n; i++) {
          if (!visited.has(i) && distMatrix[current][i] < minDist) {
            minDist = distMatrix[current][i];
            next = i;
          }
        }
        if (next === -1) break;
        path.push(next);
        cost += minDist;
        visited.add(next);
        current = next;
      }
      return { path, cost };
    }

    async function showRoute(algoName) {
      const result = results.find(res => res.name === algoName);
      if (!result) return;

      // Clear existing markers
      markers.forEach(marker => map.removeLayer(marker));
      markers = [];

      // Add custom markers with sequence numbers
      result.path.forEach((index, seq) => {
        const loc = locations[index];
        const marker = L.marker([loc.lat, loc.lon], {
          icon: L.divIcon({
            className: 'custom-marker',
            html: `${seq + 1}`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14]
          })
        }).addTo(map);
        markers.push(marker);
      });

      // Update route order list
      const routeOrder = document.getElementById('route-order').querySelector('ul');
      routeOrder.innerHTML = '';
      result.path.forEach((index, seq) => {
        const li = document.createElement('li');
        const address = locations[index].display_name;
        li.textContent = `${seq + 1}. ${address}${seq === 0 ? ' (xuất phát)' : ''}`;
        routeOrder.appendChild(li);
      });

      // Draw the route
      const routeCoords = result.path.map(i => [locations[i].lat, locations[i].lon]);
      await drawRoute(routeCoords);
    }

    async function compareAlgorithms() {
      const addressInputs = document.querySelectorAll('.address-input');
      const addresses = Array.from(addressInputs).map(input => input.value).filter(val => val.trim() !== '');
      if (addresses.length < 2) {
        document.getElementById('results').innerText = '❌ Vui lòng nhập ít nhất 2 địa chỉ.';
        return;
      }
      document.getElementById('results').innerText = '⏳ Đang xử lý...';
      try {
        locations = await Promise.all(addresses.map(addr => geocode(addr)));
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];
        locations.forEach((loc, i) => {
          const marker = L.marker([loc.lat, loc.lon], {
            icon: L.divIcon({
              className: 'custom-marker',
              html: `${i + 1}`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
              popupAnchor: [0, -14]
            })
          })
            .addTo(map)
            .bindPopup(`📍 Địa chỉ ${i+1}:<br>${loc.display_name}`);
          markers.push(marker);
        });
        map.fitBounds(L.featureGroup(markers).getBounds());
        const n = locations.length;
        distMatrix = Array(n).fill().map(() => Array(n).fill(0));
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const dist = await getDrivingDistance(
              locations[i].lat, locations[i].lon,
              locations[j].lat, locations[j].lon
            );
            distMatrix[i][j] = distMatrix[j][i] = dist;
          }
        }
        const algorithms = [
          { name: 'Ant Colony System', fn: tspAntColonySystem },
          { name: 'Nhánh và Cận', fn: tspBranchAndBound },
          { name: 'Genetic Algorithm', fn: tspGeneticAlgorithm },
          { name: 'Tham lam', fn: tspGreedy }
        ];
        results = [];
        for (const algo of algorithms) {
          const startTime = performance.now();
          const { path, cost } = algo.fn(distMatrix, n);
          const time = (performance.now() - startTime) / 1000;
          results.push({ name: algo.name, time: time.toFixed(5), path, cost: cost.toFixed(5) });
        }
        computationHistory.push(results.map(res => ({ name: res.name, time: res.time, cost: res.cost })));
        let buttonDiv = '<div>';
        results.forEach(res => {
          buttonDiv += `<button class="algo-btn" onclick="showRoute('${res.name}')">${res.name}</button>`;
        });
        buttonDiv += '</div>';
        document.getElementById('results').innerHTML = buttonDiv;
        const timeTableBody = document.getElementById('comparison-table-body');
        timeTableBody.innerHTML = '';
        computationHistory.forEach((entry, i) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>Lần ${i + 1}</td>
            <td>${entry.find(algo => algo.name === 'Ant Colony System')?.time || '-'}</td>
            <td>${entry.find(algo => algo.name === 'Nhánh và Cận')?.time || '-'}</td>
            <td>${entry.find(algo => algo.name === 'Genetic Algorithm')?.time || '-'}</td>
            <td>${entry.find(algo => algo.name === 'Tham lam')?.time || '-'}</td>
          `;
          timeTableBody.appendChild(row);
        });
        const distanceTableBody = document.getElementById('distance-table-body');
        distanceTableBody.innerHTML = '';
        computationHistory.forEach((entry, i) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>Lần ${i + 1}</td>
            <td>${entry.find(algo => algo.name === 'Ant Colony System')?.cost || '-'}</td>
            <td>${entry.find(algo => algo.name === 'Nhánh và Cận')?.cost || '-'}</td>
            <td>${entry.find(algo => algo.name === 'Genetic Algorithm')?.cost || '-'}</td>
            <td>${entry.find(algo => algo.name === 'Tham lam')?.cost || '-'}</td>
          `;
          distanceTableBody.appendChild(row);
        });
        // Clear route order list before algorithm selection
        const routeOrder = document.getElementById('route-order').querySelector('ul');
        routeOrder.innerHTML = '<li class="placeholder">Chọn thuật toán để xem thứ tự đường đi</li>';
        if (results.length > 0) {
          await showRoute(results[0].name);
        }
      } catch (err) {
        console.error(err);
        document.getElementById('results').innerText = '❌ Lỗi: ' + err.message;
        document.getElementById('comparison-table-body').innerHTML = '';
        document.getElementById('distance-table-body').innerHTML = '';
        document.getElementById('route-order').querySelector('ul').innerHTML = '<li class="placeholder">Chọn thuật toán để xem thứ tự đường đi</li>';
      }
    }
document.getElementById('address-list').addEventListener('click', function (event) {
  if (event.target.classList.contains('delete-btn')) {
    removeAddress(event.target);
  }
});