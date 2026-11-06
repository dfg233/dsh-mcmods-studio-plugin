{
  "schemaVersion": 1,
  "id": "{{modid}}",
  "version": "{{version}}",
  "name": "{{name}}",
  "description": "{{modDescription}}",
  "authors": ["{{authors}}"],
  "license": "{{license}}",
  "environment": "*",
  "entrypoints": {
    "main": ["{{package}}.{{ClassName}}"]
  },
  "depends": {
    "fabricloader": ">=0.15.0",
    "minecraft": "~1.20.1",
    "java": ">=17",
    "fabric-api": "*"
  }
}
