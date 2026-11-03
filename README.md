# Kubernetes QoS Class & Resource Units Checker

Enter the CPU and memory requests and limits of each container in a pod to see which QoS class Kubernetes assigns (Guaranteed, Burstable or BestEffort), normalize every quantity into plain units, and catch common resource mistakes.

**Use it online:** [opshubs.space/tools/kubernetes-qos-class-checker/](https://opshubs.space/tools/kubernetes-qos-class-checker/)

The online page also explains the QoS rules, OOM scores, eviction order and the quantity units.

## What it does

- Applies the QoS rules across all containers, including the rule that a limit without a request sets the request to the limit
- Parses Kubernetes quantities: `500m`, `0.5`, `512Mi`, `512M`, `1Gi`, `129e6`
- Flags lowercase-`m` memory (`512m` is 0.512 bytes), requests above limits, CPU finer than 1m, decimal vs binary units and missing memory limits
- Generates the `resources:` YAML and converts between units

## Run it locally

Everything runs in the browser with no dependencies, build step or tracking. Clone the repo and open `index.html`.

The parsing and classification logic lives in `calc.js` and has no DOM dependencies. To run the tests (Node.js 18 or newer):

```sh
node test.js
```

It prints a success line when all assertions pass.

## Files

| File | Purpose |
|---|---|
| `index.html` | Standalone checker page |
| `calc.js` | Quantity parsing and QoS classification |
| `test.js` | Unit tests for `calc.js` |

## Feedback

Found a case where the checker disagrees with your cluster? Open an issue with the pod spec and `kubectl get pod -o jsonpath='{.status.qosClass}'` output.

More free ops tools: [opshubs.space/tools](https://opshubs.space/tools/)

## License

MIT
