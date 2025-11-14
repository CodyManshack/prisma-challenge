// haha using a mounted json file for persistence in a coding challenge for a database company
const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.resolve(__dirname, 'data/instances.json');

function read() {
  try {
    const data = fs.readFileSync(REGISTRY_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // if file doesn’t exist or is invalid, start fresh
    return [];
  }
}

function write(instances) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(instances, null, 2), 'utf8');
}

function addInstance(record) {
  const instances = read();
  instances.push(record);
  write(instances);
}

function removeInstance(id) {
  const instances = read();
  const filtered = instances.filter(inst => inst.id !== id);
  write(filtered);
}

module.exports = {
  read,
  write,
  addInstance,
  removeInstance,
};