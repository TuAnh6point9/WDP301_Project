/** The six AI input parameters shown on the Calculate WQI screen. */
export type Inputs = { ph: number; do: number; bod5: number; cod: number; nh4: number; coliform: number };
export type Calculation = { id: string; at: string; station: string; inputs: Inputs; wqi: number };
