export type Client = {
  id: number;
  name: string;
};

const clientNames = [
  "Mercado Aurora",
  "Padaria Bom Grão",
  "Empório Serra Azul",
  "Panificadora Trigo Fino",
  "Supermercado Boa Vista",
  "Açougue Nobre",
  "Doceria Canela",
  "Padaria Sol Nascente Centro",
  "Mercado Vila Nova 1",
  "Frigorífico Campo Belo",
  "Pão de Mel",
  "Mercearia Horizonte",
  "Padaria Sol Nascente Litoral",
  "Empório Ipê",
  "Massas da Nonna",
  "Mercado Jardim",
  "Padaria Estrela Guia",
  "Distribuidora Rota Sul",
  "Confeitaria Lumière",
  "Hortifruti Verde Vale Norte",
  "Hortifruti Verde Vale Sul",
  "Hortifruti Verde Vale Paraíso",
  "Hortifruti Verde Vale Aclimação",
  "Hortifruti Verde Vale Leste",
  "Mercado Vila Nova 2",
];

export const clients: Client[] = clientNames.map((name, index) => ({
  id: index + 1,
  name,
}));

/** Service type chosen at the start of step 2 (stored in FormState.call). */
export const serviceTypes = ["Manutenção preventiva", "Manutenção corretiva"];

/** Pre-filled when "Manutenção preventiva" is chosen; the technician completes it. */
export const PREVENTIVE_PROCEDURE_TEXT = "Foi realizada a manutenção preventiva na loja e na casa de máquinas.";

/**
 * Parts the Tecnoramos team uses most in commercial refrigeration, based on
 * what technicians recorded in their orders. Anything else goes in free text.
 */
export const commonParts = [
  "Sem utilização de peças",
  "Micromotor do ventilador",
  "Hélice",
  "Sensor de temperatura",
  "Controlador",
  "Pressostato",
  "Mangueira do pressostato",
  "Mangueira capilar",
  "Válvula solenoide",
  "Válvula de expansão",
  "Filtro secador",
  "Resistência de degelo",
  "Contator",
  "Óleo para compressor",
];
