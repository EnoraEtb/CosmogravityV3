import { Simulation_trajectory } from "./simulation_trajectory.js";
import { c, G } from "./../../constants.js";
/**
 * @class Schwarzschild
 *
 * Inherited from Simulation_trajectory class.
 * This class will implement the different equations for the Schwarzchild metric.
 * https://www.lupm.in2p3.fr/cosmogravity/theorie/theorie_trajectoires_FR.pdf
 * Note: This code uses acronyms to differentiate between the different categories
 * covered by the theory (example: EMS_PH = External Schwarzschild metric for a Photon).
 *
 * @param id
 * @param central_body
 * @param mobile_list
 * @param c
 * @param G
 *
 * @method add_mobile
 * @method mobile_initialization
 * @method mobile_dtau
 * @method mobile_trajectory
 * @method mobile_new_position
 * @method mobile_velocity
 * @method mobile_clocks
 * @method ESM_MP_integration_constants
 * @method ESM_MP_potential_A
 * @method ESM_MP_potential_DO
 * @method ESM_MP_trajectory_A
 * @method ESM_MP_trajectory_DO
 * @method ESM_PH_integration_constants
 * @method ESM_PH_potential_A
 * @method ESM_PH_potential_DO
 * @method ESM_PH_trajectory_A
 * @method ESM_PH_trajectory_DO
 * @method ISM_alpha_r
 * @method ISM_beta_r
 * @method ISM_MP_integration_constants
 * @method ISM_MP_potential_A
 * @method ISM_MP_trajectory_A
 * @method ISM_PH_integration_constants
 * @method ISM_PH_potential_A
 * @method ISM_PH_trajectory_A
 */
export class Schwarzschild extends Simulation_trajectory {
    //-------------------- Constructor --------------------
    constructor(id, collidable, mass, radius, angular_m) {
        super(id, collidable, mass, radius, angular_m);
    }
    //---------------------- Methods -----------------------
    /**
     * Method that loops over the mobile list and determines the
     * correct integration constants before storing them in each
     * mobile as a property. It also takes the user input in terms
     * of physical velocity and calculate the corresponding U_r and U_phi.
     */
    mobile_initialization() {
        let R_s = this.central_body.R_s;
        let radius = this.central_body.radius;
        this.mobile_list.forEach(mobile => {
            if (mobile.r >= radius || radius === 0) {
                if (!mobile.is_photon) {
                    let E = Math.pow((1 - R_s / mobile.r), .5)
                        / Math.pow((1 - Math.pow(mobile.v_r / c, 2)), .5);
                    mobile.U_r = Math.cos(mobile.v_alpha) * mobile.v_r * E;
                    mobile.U_phi = Math.sin(mobile.v_alpha) * mobile.v_r * E
                        / Math.pow((1 - R_s / mobile.r), .5);
                    this.ESM_MP_integration_constants(mobile);
                }
                else if (mobile.is_photon) {
                    mobile.U_r = Math.cos(mobile.v_alpha) * c;
                    mobile.U_phi = Math.sin(mobile.v_alpha) * c
                        / Math.pow((1 - R_s / mobile.r), .5);
                    this.ESM_PH_integration_constants(mobile);
                }
            }
            else if (mobile.r < radius && radius !== 0) {
                let alpha = this.ISM_alpha_r(mobile);
                let beta = this.ISM_beta_r(mobile);
                if (!mobile.is_photon) {
                    let E = Math.pow(beta, .5)
                        / Math.pow((1 - mobile.v_r * 2 / Math.pow(c, 2)), .5);
                    mobile.U_r = Math.cos(mobile.v_alpha) * Math.pow(alpha, .5)
                        * mobile.v_r * E;
                    mobile.U_phi = Math.sin(mobile.v_alpha) * mobile.v_r * E
                        / beta;
                    this.ISM_MP_integration_constants(mobile);
                }
                else if (mobile.is_photon) {
                    mobile.U_r = Math.cos(mobile.v_alpha) * Math.pow(alpha, .5) * c
                        / beta;
                    mobile.U_phi = Math.sin(mobile.v_alpha) * c / beta;
                    this.ISM_PH_integration_constants(mobile);
                }
            }
        });
    }
    /**
     * Determines the right dtau for each mobile and updates the parameter.
     * The dtau and free_fall_time (temps_chute_libre in the old code) formulas
     * are not included in the theory but are the result of trial and error.
     * Ask Mr. Cordoni and Mr. Reboul for more information..
     */
    mobile_dtau(reference_frame) {
        let radius = this.central_body.radius;
        this.mobile_list.forEach(mobile => {
            let free_fall_time = Math.PI * mobile.r * Math.pow(Math.sqrt(mobile.r / (2 * G * this.central_body.mass)), .5) / 2;
            if (!mobile.is_photon) {
                if (mobile.r >= radius || radius === 0) {
                    mobile.dtau = mobile.r / (Math.sqrt(Math.pow(mobile.U_r, 2) + Math.pow(mobile.U_phi, 2)) + 1e-10) / 1e3;
                    if (mobile.dtau > free_fall_time / 500) {
                        mobile.dtau = free_fall_time / 500;
                    }
                }
                else if (mobile.r < radius && radius !== 0) {
                    mobile.dtau = mobile.r
                        / (Math.sqrt(Math.pow(mobile.U_r, 2) + Math.pow(mobile.U_phi, 2)) + 1e-20) / 1000;
                    if (mobile.dtau > free_fall_time / 500) {
                        mobile.dtau = free_fall_time / 500;
                    }
                }
            }
            else if (mobile.is_photon) {
                if (reference_frame === "A") {
                    mobile.dtau = 1e-3 * mobile.r
                        / (Math.abs(mobile.U_r) + Math.abs(mobile.U_phi) + 1);
                }
                else {
                    mobile.dtau = mobile.r
                        / (Math.sqrt(Math.pow(mobile.U_r, 2) + Math.pow(mobile.U_phi, 2)) + 1) / 1000;
                    if (mobile.dtau > free_fall_time / 500) {
                        mobile.dtau = free_fall_time / 500;
                    }
                }
            }
        });
    }
    /**
     * Applies the Runge-Kutta algorithm to the relevant second derivative
     * expression for the current simulation.
     * @param mobile
     * @param step dtau
     * @param reference_frame Astronaut (A), Distant Observer (DO)
     *
     * @returns [tau, r, U_r]
     */
    mobile_trajectory(mobile, step, reference_frame) {
        let dtau = step;
        let tau;
        let radius = this.central_body.radius;
        let is_photon = mobile.is_photon;
        let r = mobile.r;
        let U_r = mobile.U_r;
        if ((mobile.r >= radius || radius === 0) && !is_photon && reference_frame === "A") {
            return this.runge_kutta_equation_order2(mobile, dtau, tau, r, U_r, this.ESM_MP_trajectory_A);
        }
        else if ((mobile.r >= radius || radius === 0) && !is_photon && reference_frame === "DO") {
            return this.runge_kutta_equation_order2(mobile, dtau, tau, r, U_r, this.ESM_MP_trajectory_DO);
        }
        else if ((mobile.r >= radius || radius === 0) && is_photon && reference_frame === "A") {
            return this.runge_kutta_equation_order2(mobile, dtau, tau, r, U_r, this.ESM_PH_trajectory_A);
        }
        else if ((mobile.r >= radius || radius === 0) && is_photon && reference_frame === "DO") {
            return this.runge_kutta_equation_order2(mobile, dtau, tau, r, U_r, this.ESM_PH_trajectory_DO);
        }
        else if (mobile.r < radius && radius !== 0) {
            if (!is_photon) {
                return this.runge_kutta_equation_order2(mobile, dtau, tau, r, U_r, this.ISM_MP_trajectory_A);
            }
            else {
                return this.runge_kutta_equation_order2(mobile, dtau, tau, r, U_r, this.ISM_PH_trajectory_A);
            }
        }
    }
    /**
     * Updates a mobile with its new position
     * @param mobile
     * @param step dtau
     * @param reference_frame Astronaut (A), Distant Observer (DO)
     */
    mobile_new_position(mobile, step, reference_frame) {
        let dtau = step;
        let R_s = this.central_body.R_s;
        let runge_kutta_result = this.mobile_trajectory(mobile, dtau, reference_frame);
        mobile.r = runge_kutta_result[1];
        mobile.U_r = runge_kutta_result[2];
        if (reference_frame === "A") {
            mobile.phi += c * mobile.L * dtau / Math.pow(mobile.r, 2);
        }
        else {
            mobile.phi += c * mobile.L * dtau * (1 - R_s / mobile.r)
                / Math.pow(mobile.r, 2) / mobile.E;
        }
    }
    /**
     * Updates the physical velocity of a mobile
     * @param mobile
     */
    mobile_velocity(mobile) {
        let radius = this.central_body.radius;
        let R_s = this.central_body.R_s;
        if (mobile.r >= radius || radius === 0) {
            let dt = mobile.E / (1 - R_s / mobile.r);
            let dphi = c * mobile.L / Math.pow(mobile.r, 2);
            mobile.v_phi = Math.sqrt(Math.pow((mobile.r * dphi / dt), 2) / (1 - R_s / mobile.r));
            if (!mobile.is_photon) {
                let dr = Math.pow((c / mobile.E), 2) * Math.pow((1 - R_s / mobile.r), 2)
                    * (Math.pow(mobile.E, 2) - (1 - R_s / mobile.r) * (1 + Math.pow((mobile.L / mobile.r), 2)));
                mobile.v_r = Math.pow(Math.abs(dr / Math.pow((1 - R_s / mobile.r), 2)), .5);
            }
            else {
                let dr = Math.pow((c / mobile.E), 2) * Math.pow((1 - R_s / mobile.r), 2)
                    * (Math.pow(mobile.E, 2) - (1 - R_s / mobile.r) * (Math.pow((mobile.L / mobile.r), 2)));
                mobile.v_r = Math.pow(Math.abs(dr / Math.pow((1 - R_s / mobile.r), 2)), .5);
            }
        }
        else if (mobile.r < radius && radius !== 0) {
            let alpha = this.ISM_alpha_r(mobile);
            let beta = this.ISM_beta_r(mobile);
            mobile.v_phi = Math.sqrt((Math.pow(mobile.r, 2) / Math.pow(beta, 2))
                * Math.pow((c * mobile.L * Math.pow(beta, 2) / Math.pow(mobile.r, 2)), 2));
            if (!mobile.is_photon) {
                let dr = (Math.pow((c / mobile.E), 2)) * alpha * Math.pow(beta, 4) * (Math.pow((mobile.E / beta), 2)
                    - Math.pow((mobile.L / mobile.r), 2) - 1);
                mobile.v_r = Math.sqrt(dr / (alpha * Math.pow(beta, 2)));
            }
            else {
                let dr = (Math.pow((c / mobile.E), 2)) * alpha * (Math.pow(beta, 4))
                    * (Math.pow((mobile.E / beta), 2) - Math.pow((mobile.L / mobile.r), 2));
                mobile.v_r = Math.sqrt(dr / (alpha * Math.pow(beta, 2)));
            }
        }
        mobile.v_norm = Math.pow((Math.pow(mobile.v_r, 2) + Math.pow(mobile.v_phi, 2)), .5);
    }
    /**
     * Updates time parameters of a mobile
     * @param mobile
     * @param reference_frame Astronaut (A), Distant Observer (DO)
     */
    mobile_clocks(mobile, reference_frame) {
        let radius = this.central_body.radius;
        let R_s = this.central_body.R_s;
        if (mobile.r >= radius || radius === 0) {
            if (reference_frame === "A") {
                if (!mobile.is_photon) {
                    mobile.clock_a += mobile.dtau;
                }
                if (mobile.r > R_s) {
                    mobile.clock_do += mobile.E / (1 - R_s / mobile.r) * mobile.dtau;
                }
                else {
                    mobile.clock_do = Infinity;
                }
            }
            else {
                mobile.clock_do += mobile.dtau;
                if (mobile.r >= R_s && !mobile.is_photon) {
                    mobile.clock_a += mobile.dtau * (1 - R_s / mobile.r) / mobile.E;
                }
            }
        }
        else if (mobile.r < radius && radius !== 0) {
            if (reference_frame === "A") {
                mobile.clock_do += mobile.dtau * mobile.E / Math.pow(this.ISM_beta_r(mobile), 2);
                if (!mobile.is_photon) {
                    mobile.clock_a += mobile.dtau;
                }
            }
            else {
                mobile.clock_do += mobile.dtau;
                if (!mobile.is_photon) {
                    mobile.clock_a += mobile.dtau * Math.pow(this.ISM_beta_r(mobile), 2) / mobile.E;
                }
            }
        }
    }
    //  I/ The external Schwarzschild metric (ESM)
    /*
     * r > R
     * The spacial and temporal coordinates are (r, theta, phi, t)
     * All simulations take place on the theta=pi/2 plane
     * U_r is dr and U_phi is dphi
     * R_s is Schwarzschild radius
     * L and E are two Integration constants determined with the
     * initial conditions. L is a length and E is adimentional.
     * The "trajectory" functions are to be called by the Runge-Kutta algorithm.
     * The suffix A or DO refer to Astronaut or Distant Oberver.
     */
    //  1) For a massive particle (ESM_MP)
    /**
     * External Schwarzschild metric for a Massive Particle (ESM_MP)
     *
     * Calculate the integration constants for a mobile in the current
     * simulation and store the value as a mobile property.
     * @param mobile
     */
    ESM_MP_integration_constants(mobile) {
        mobile.L = mobile.U_phi * mobile.r / c;
        mobile.E = Math.sqrt(Math.pow(mobile.U_r / c, 2)
            + (1 - this.central_body.R_s / mobile.r)
                * (1 + Math.pow(mobile.U_phi / c, 2)));
    }
    /**
     * External Schwarzschild metric for a Massive Particle (ESM_MP)
     *
     * Potential for an astronaut (A) divided by c??
     * @param mobile
     * @returns Potential
     */
    ESM_MP_potential_A(mobile) {
        return (1 - this.central_body.R_s / mobile.r)
            * (1 + Math.pow((mobile.L / mobile.r), 2));
    }
    /**
     * External Schwarzschild metric for a Massive Particle (ESM_MP)
     *
     * Potential for a distant observer (DO) divided by c??
     * @param mobile
     * @returns Potential
     */
    ESM_MP_potential_DO(mobile) {
        let V_a = (1 - this.central_body.R_s / mobile.r)
            * (1 + Math.pow((mobile.L / mobile.r), 2));
        return Math.pow(mobile.E, 2) - (Math.pow(c, 2) - V_a / Math.pow(mobile.E, 2))
            * Math.pow((1 - this.central_body.R_s / mobile.r), 2) / Math.pow(c, 2);
    }
    /**
     * External Schwarzschild metric for a Massive Particle (ESM_MP)
     *
     * Second derivative d??r/dtau?? for an astronaut (A)
     *
     * This method is to be used with Runge-Kutta.
     * @param mobile
     * @param t
     * @param r
     * @param U_r
     */
    ESM_MP_trajectory_A(mobile, t, r, U_r) {
        return Math.pow(c, 2) / (2 * Math.pow(r, 4)) * (-this.central_body.R_s * Math.pow(r, 2)
            + (2 * r - 3 * this.central_body.R_s) * Math.pow(mobile.L, 2));
    }
    /**
     * External Schwarzschild metric for a Massive Particle (ESM_MP)
     *
     * Second derivative d??r/dt?? for a distant observer (DO)
     *
     * This method is to be used with Runge-Kutta.
     * @param mobile
     * @param t
     * @param r
     * @param U_r
     */
    ESM_MP_trajectory_DO(mobile, t, r, U_r) {
        return Math.pow(c, 2) * (r - this.central_body.R_s) * (2 * Math.pow(mobile.E, 2) * Math.pow(r, 3) * this.central_body.R_s
            + 2 * Math.pow((mobile.L * r), 2) - 7 * Math.pow(mobile.L, 2) * r * this.central_body.R_s
            + 5 * Math.pow((mobile.L * this.central_body.R_s), 2) - 3 * Math.pow(r, 3) * this.central_body.R_s
            + 3 * Math.pow((r * this.central_body.R_s), 2)) / (2 * Math.pow(mobile.E, 2) * Math.pow(r, 6));
    }
    //  2) For a photon (ESM_PH)
    /**
     * External Schwarzschild metric for a photon (ESM_PH)
     *
     * Calculate the integration constants for a mobile in the current
     * simulation and store the value as a mobile property.
     * @param mobile
     */
    ESM_PH_integration_constants(mobile) {
        mobile.L = mobile.U_phi * mobile.r / c;
        mobile.E = Math.sqrt(Math.pow(mobile.U_r / c, 2)
            + (1 - this.central_body.R_s / mobile.r)
                * Math.pow(mobile.U_phi / c, 2));
    }
    /**
     * External Schwarzschild metric for a photon (ESM_PH)
     *
     * Potential for an astronaut (A) divided by c??
     * @param mobile
     * @returns Potential
     */
    ESM_PH_potential_A(mobile) {
        return (1 - this.central_body.R_s / mobile.r)
            * (1 + Math.pow((mobile.L / mobile.r), 2));
    }
    /**
     * External Schwarzschild metric for a photon (ESM_PH)
     *
     * Potential for a distant observer (DO) divided by c??
     * @param mobile
     * @returns Potential
     */
    ESM_PH_potential_DO(mobile) {
        let V_a = (1 - this.central_body.R_s / mobile.r)
            * (1 + Math.pow((mobile.L / mobile.r), 2));
        return Math.pow(mobile.E, 2) - (Math.pow(c, 2) - V_a / Math.pow(mobile.E, 2))
            * Math.pow((1 - this.central_body.R_s / mobile.r), 2) / Math.pow(c, 2);
    }
    /**
     * External Schwarzschild metric for a photon (ESM_PH)
     *
     * Second derivative d??r/dlambda?? for an astronaut (A)
     *
     * This method is to be used with Runge-Kutta.
     * @param mobile
     * @param t
     * @param r
     * @param U_r
     */
    ESM_PH_trajectory_A(mobile, t, r, U_r) {
        return Math.pow(c, 2) / (2 * Math.pow(r, 4)) * (2 * r - 3 * this.central_body.R_s) * Math.pow(mobile.L, 2);
    }
    /**
     * External Schwarzschild metric for a photon (ESM_PH)
     *
     * Second derivative d??r/dt?? for a distant observer (DO)
     *
     * This method is to be used with Runge-Kutta.
     * @param mobile
     * @param t
     * @param r
     * @param U_r
     */
    ESM_PH_trajectory_DO(mobile, t, r, U_r) {
        return Math.pow(c, 2) * (r - this.central_body.R_s) * (2 * Math.pow(mobile.E, 2) * Math.pow(r, 3)
            * this.central_body.R_s + 2 * Math.pow((mobile.L * r), 2) - 7 * Math.pow(mobile.L, 2) * r
            * this.central_body.R_s + 5 * Math.pow((mobile.L * this.central_body.R_s), 2))
            / (2 * Math.pow(mobile.E, 2) * Math.pow(r, 6));
    }
    //  II/ The internal Schwarzschild metric (ISM)
    /*
     * r < R
     * The Integration constants are now called L and E
     * Definition of two new variables alpha and beta.
     */
    /**
     * Internal Schwarzschild metric (ISM)
     *
     * Defines a new variable alpha(r)
     * @param mobile
     * @returns alpha(r)
     */
    ISM_alpha_r(mobile) {
        return 1 - Math.pow(mobile.r, 2) * this.central_body.R_s
            / Math.pow(this.central_body.radius, 3);
    }
    /**
     * Internal Schwarzschild metric (ISM)
     *
     * Defines a new variable beta(r)
     * @param mobile
     * @returns beta(r)
     */
    ISM_beta_r(mobile) {
        return 3 / 2 * Math.pow((1 - this.central_body.R_s
            / this.central_body.radius), .5) - .5
            * Math.pow((1 - Math.pow(mobile.r, 2) * this.central_body.R_s
                / Math.pow(this.central_body.radius, 3)), .5);
    }
    //  1) For a massive particle (ISM_MP)
    /**
     * Internal Schwarzschild metric for a massive particle (ISM_MP)
     *
     * Calculate the integration constants for a mobile in the current
     * simulation and store the value as a mobile property.
     * @param mobile
     */
    ISM_MP_integration_constants(mobile) {
        mobile.L = mobile.U_phi * mobile.r / c;
        mobile.E = this.ISM_beta_r(mobile) / c * Math.sqrt(Math.pow(mobile.U_r, 2)
            / this.ISM_alpha_r(mobile) + Math.pow(mobile.U_phi, 2) + Math.pow(c, 2));
    }
    /**
     * Internal Schwarzschild metric for a massive particle (ISM_MP)
     *
     * Potential for an astronaut (A) divided by c??
     * @param mobile
     * @returns Potential
     */
    ISM_MP_potential_A(mobile) {
        return Math.pow(mobile.E, 2) - this.ISM_alpha_r(mobile)
            * (Math.pow(mobile.E / this.ISM_beta_r(mobile), 2)
                - Math.pow(mobile.L / mobile.r, 2) - 1);
    }
    /**
     * Internal Schwarzschild metric for a massive particle (ISM_MP)
     *
     * Second derivative d??r/dtau?? for an astronaut (A)
     *
     * This method is to be used with Runge-Kutta.
     * @param mobile
     * @param t
     * @param r
     * @param U_r
     */
    ISM_MP_trajectory_A(mobile, t, r, U_r) {
        return -(Math.pow(c, 2) * r * this.central_body.R_s / Math.pow(this.central_body.radius, 3))
            * (Math.pow(mobile.E / this.ISM_beta_r(mobile), 2) - Math.pow(mobile.L / r, 2) - 1)
            + Math.pow(c, 2) * this.ISM_alpha_r(mobile) * .5 * (-(Math.pow(mobile.E, 2) * r * this.central_body.R_s)
                / (Math.pow((this.ISM_beta_r(mobile) * this.central_body.radius), 3)
                    * Math.pow(this.ISM_alpha_r(mobile), .5)) + 2 * Math.pow(mobile.L, 2) / Math.pow(r, 3));
    }
    //  2) For a photon (ISM_PH)
    /**
     * Internal Schwarzschild metric for a massive particle (ISM_MP)
     *
     * Calculate the integration constants for a mobile in the current
     * simulation and store the value as a mobile property.
     * @param mobile
     */
    ISM_PH_integration_constants(mobile) {
        mobile.L = mobile.U_phi * mobile.r / c;
        mobile.E = this.ISM_beta_r(mobile) / c
            * Math.sqrt(Math.pow(mobile.U_r, 2) / this.ISM_alpha_r(mobile) + Math.pow(mobile.U_phi, 2));
    }
    /**
     * Internal Schwarzschild metric for a photon (ISM_PH)
     *
     * Potential for an astronaut (A) divided by c??
     * @param mobile
     * @returns Potential
     */
    ISM_PH_potential_A(mobile) {
        return Math.pow(mobile.E, 2) - this.ISM_alpha_r(mobile)
            * (Math.pow(mobile.E / this.ISM_beta_r(mobile), 2)
                - Math.pow(mobile.L / mobile.r, 2));
    }
    /**
     * Internal Schwarzschild metric for a photon (ISM_PH)
     *
     * Second derivative d??r/dlambda?? for an astronaut (A)
     *
     * This method is to be used with Runge-Kutta.
     * @param mobile
     * @param t
     * @param r
     * @param U_r
     */
    ISM_PH_trajectory_A(mobile, t, r, U_r) {
        return -(Math.pow(c, 2) * r * this.central_body.R_s / Math.pow(this.central_body.radius, 3))
            * (Math.pow(mobile.E / this.ISM_beta_r(mobile), 2) - Math.pow(mobile.L / r, 2))
            + Math.pow(c, 2) * this.ISM_alpha_r(mobile) * .5 * (-(Math.pow(mobile.E, 2) * r * this.central_body.R_s)
                / (Math.pow((this.ISM_beta_r(mobile) * this.central_body.radius), 3)
                    * Math.pow(this.ISM_alpha_r(mobile), .5)) + 2 * Math.pow(mobile.L, 2) / Math.pow(r, 3));
    }
}
