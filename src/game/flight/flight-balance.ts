export interface FlightBalance {
  controls: {
    stableHeadingMinSpeed: number;
  };
}

export const FLIGHT_BALANCE: FlightBalance = {
  controls: {
    stableHeadingMinSpeed: 0.18,
  },
};
