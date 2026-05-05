---
name: pagarme
description: checkout_pagarme_skill_order
---

# Pagar.me Checkout

> Página de pagamento hospedada nos servidores Pagar.me. O merchant envia os dados da venda via API, recebe uma URL e redireciona o comprador — sem formulário próprio, sem lidar com dados de cartão diretamente.

Pagar.me é a principal API de pagamentos do Brasil. O Checkout oferece dois modelos de cobrança, ambos criados via o mesmo endpoint `POST /paymentlinks`, diferenciados pelo campo `type`.

## Funcionamento geral

Cobrança pontual (order):

```
Merchant → POST /paymentlinks → recebe URL → redireciona comprador
```

Cobrança recorrente (subscription):

```
Merchant → POST /plans → POST /paymentlinks → recebe URL → redireciona comprador
```

* Credencial: secret key (`sk_...`) via HTTP Basic Auth
* Header obrigatório em toda requisição: `User-Agent: pagarme-skill-generated/1.0`
* Valores sempre em centavos: R$100,00 = `10000`

## Ambientes

| Ambiente | Base URL                           | Credencial    |
| -------- | ---------------------------------- | ------------- |
| Teste    | `https://sdx-api.pagar.me/core/v5` | `sk_test_...` |
| Produção | `https://api.pagar.me/core/v5`     | `sk_live_...` |

***

## Modelos de cobrança

### Cobrança Pontual (`type: "order"`)

Transação única. O cliente acessa a URL, paga e o checkout é encerrado.

Indicado para:

* E-commerce e lojas virtuais
* Vendas avulsas e links de pagamento ad hoc
* Qualquer cobrança que acontece uma única vez

Meios disponíveis: cartão de crédito, Pix, boleto.

SKILL técnica: [https://docs.pagar.me/docs/checkout\_pagarme\_skill\_order.md](https://docs.pagar.me/docs/checkout_pagarme_skill_order.md)

***

### Cobrança Recorrente (`type: "subscription"`)

O cliente se cadastra via checkout e passa a ser cobrado automaticamente no ciclo definido pelo plano.

Indicado para:

* Assinaturas e planos mensais
* Mensalidades e anuidades
* Qualquer cobrança que se repete no tempo

Meios disponíveis: cartão de crédito, boleto.
Não disponível: Pix, parcelamento, split.

> ⚠️ Requer plano criado previamente via `POST /plans`.
>
> O `plan_id` retornado deve ser usado em `cart_settings.recurrences[].plan_id`.

Fluxo:

```
1. POST /plans          → retorna plan.id
2. POST /paymentlinks   → usa plan.id em cart_settings.recurrences[]
```

SKILL técnica: [https://docs.pagar.me/docs/checkout\_pagarme\_skill\_subscription.md](https://docs.pagar.me/docs/checkout_pagarme_skill_subscription.md)

***

## Referências

* Sobre o Checkout: [https://docs.pagar.me/docs/checkout-about](https://docs.pagar.me/docs/checkout-about)
* Como usar: [https://docs.pagar.me/docs/checkout-use](https://docs.pagar.me/docs/checkout-use)
* Criar link — endpoint e parâmetros: [https://docs.pagar.me/reference/criar-link.md](https://docs.pagar.me/reference/criar-link.md)
* Parâmetros do link: [https://docs.pagar.me/reference/checkout-link.md](https://docs.pagar.me/reference/checkout-link.md)
* Schema da resposta: [https://docs.pagar.me/reference/checkout-response.md](https://docs.pagar.me/reference/checkout-response.md)
* Criar plano — endpoint e parâmetros: [https://docs.pagar.me/reference/criar-plano-1.md](https://docs.pagar.me/reference/criar-plano-1.md)
* Visão geral de recorrência: [https://docs.pagar.me/docs/overview-recorrência](https://docs.pagar.me/docs/overview-recorrência)