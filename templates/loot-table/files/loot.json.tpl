{
  "type": "minecraft:block",
  "pools": [
    {
      "rolls": 1,
      "entries": [
        {
          "type": "minecraft:item",
          "name": "{{modid}}:{{id}}",
          "functions": [
            { "function": "minecraft:set_count", "count": { "min": {{min}}, "max": {{max}} } }
          ]
        }
      ],
      "conditions": [
        { "condition": "minecraft:survives_explosion" }
      ]
    }
  ]
}
