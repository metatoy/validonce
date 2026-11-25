Frozen copies of `conformance/golden/{aspnet,fastapi}.openapi.json` as they were with only the Signup
contract. The generator tests (wrap, kubb, orval) match these against fixed generator output, so
they must not change when a new contract is added to the live golden files.
