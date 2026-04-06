"""Domain-specific subgraphs for the ThetaLab agent hierarchy.

Each module in this package represents one domain (crypto, options, …)
and exposes a standard factory function::

    def build_graph(model, profile_text: str) -> CompiledGraph

Adding a new domain:
  1. Create a new module (e.g. ``forex.py``) in this package.
  2. Implement ``build_graph(model, profile_text)``.
  3. Register it in ``graph_builder.py``.
"""
