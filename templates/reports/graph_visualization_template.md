# Knowledge Graph Visualization

## Research Query
**{{query}}**

---

## Graph Overview

{{overview}}

---

## Mermaid Diagram

```mermaid
graph {{direction}}
{{#each nodes}}
    {{this.id}}[{{this.label}}]
{{/each}}

{{#each edges}}
    {{this.from}} -->|{{this.label}}| {{this.to}}
{{/each}}
```

---

## Node Details

{{#each nodes}}
### {{this.label}} (`{{this.id}}`)

**Type**: {{this.type}}  
**Confidence**: {{this.confidence}}/10

{{#if this.description}}
**Description**: {{this.description}}
{{/if}}

{{#if this.properties}}
**Properties**:
{{#each this.properties}}
- **{{@key}}**: {{this}}
{{/each}}
{{/if}}

{{#if this.sources}}
**Sources**: {{#each this.sources}}[{{@index}}]({{this}}) {{/each}}
{{/if}}

---

{{/each}}

## Relationships

{{#each edges}}
### {{this.from}} → {{this.to}}

**Relationship**: {{this.label}}  
**Strength**: {{this.weight}}/10

{{#if this.evidence}}
**Evidence**: {{this.evidence}}
{{/if}}

{{#if this.sources}}
**Sources**: {{#each this.sources}}[{{@index}}]({{this}}) {{/each}}
{{/if}}

---

{{/each}}

## Graph Statistics

- **Total Nodes**: {{node_count}}
- **Total Edges**: {{edge_count}}
- **Graph Density**: {{density}}
- **Average Degree**: {{avg_degree}}
- **Connected Components**: {{connected_components}}
- **Clustering Coefficient**: {{clustering_coefficient}}

---

## Clusters

{{#each clusters}}
### Cluster {{@index}}: {{this.theme}}

**Nodes**: {{this.node_count}}  
**Cohesion**: {{this.cohesion}}/10

#### Members
{{#each this.nodes}}
- {{this}}
{{/each}}

#### Interpretation
{{this.interpretation}}

---

{{/each}}

## Key Insights

{{#each insights}}
{{@index}}. {{this}}
{{/each}}

---

## Central Concepts

{{#each central_concepts}}
### {{this.concept}}

**Centrality Score**: {{this.score}}  
**Connected To**: {{this.connections}} other concepts

{{this.why_important}}

---

{{/each}}

---

## Metadata

- **Report ID**: `{{report_id}}`
- **Graph ID**: `{{graph_id}}`
- **Generated**: {{generated_at}}
- **Algorithm**: {{algorithm}}
- **Visual Embeddings**: {{visual_embedding_count}}

---

*This graph visualization was automatically generated from research findings using knowledge graph analysis.*

*View interactive version in Dreamspace UI*




