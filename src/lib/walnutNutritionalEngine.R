# walnutNutritionalEngine.R
# Scientific Engine for Deciduous Tree Crop Nutrition (Walnut Focus)
# Based on Australian Riverina Agronomic Standards

library(dplyr)

# --- 1. Constants & Thresholds ---

CRITICAL_VALUES <- list(
  leaf = list(
    N = c(min = 2.2, max = 3.2),    # %
    K = c(min = 1.2, max = Inf),    # %
    P = c(min = 0.1, max = Inf),    # %
    Zn = c(min = 18,  max = Inf),   # ppm
    B = c(min = 36,  max = 300)     # ppm
  ),
  removal_rates = list(
    N_per_tonne = 20,  # kg/t (including hulls)
    K_per_tonne = 20,  # kg/t (including hulls)
    P_per_tonne = 4.3  # kg/t
  )
)

# --- 2. Dynamic Tree Functions ---

#' Calculate Nitrogen Sequestration (Biological Lock-up)
#' @param age Orchard age in years
calc_lockup_n <- function(age) {
  # Scales linearly to Year 10, then plateaus at 17 kg/ha
  return(min(17, 1.7 * age))
}

#' Calculate Base Nitrogen Maintenance per Tree
#' @param age Orchard age in years
calc_maintenance_n <- function(age) {
  if (age == 1) return(0.10)
  if (age <= 3) return(0.30)
  return(0.40) # Year 4+ (Commercial Bearing)
}

# --- 3. Edaphic & Environmental Logic ---

#' Get pH-driven Availability Factor (AF)
#' @param nutrient Nutrient code (N, P, Zn)
#' @param ph Soil pH value
get_ph_availability <- function(nutrient, ph) {
  if (nutrient == "P") {
    if (ph < 6.0) return(0.40)
    if (ph > 7.5) return(0.50)
    return(1.00)
  }
  if (nutrient == "Zn") {
    if (ph > 7.0) return(0.30)
    return(1.00)
  }
  if (nutrient == "N") {
    if (ph < 6.0) return(0.80)
    return(1.00)
  }
  return(1.00)
}

# --- 4. Core Budgeting Engine ---

#' Calculate Total Replacement Requirement
#' @param yield Expected yield (t/ha)
#' @param density Tree density (trees/ha)
#' @param age Orchard age (years)
#' @param ph Soil pH
#' @param soil_type "Sandy Loam" or "Heavy Clay"
#' @param fue_n Baseline Fertilizer Use Efficiency for N (e.g., 0.7)
calculate_nutrient_budget <- function(yield, density, age, ph, soil_type, fue_n = 0.7, fue_k = 0.7, fue_p = 0.7) {
  
  # Adjust FUE for soil-specific fixation (Red Brown Earth logic)
  if (soil_type == "Heavy Clay") {
    fue_k <- fue_k * 0.7 # 30% penalty for interlayer fixation
  }
  
  # 1. Nitrogen Budget
  n_maint_total <- density * calc_maintenance_n(age)
  n_export <- yield * CRITICAL_VALUES$removal_rates$N_per_tonne
  n_lockup <- calc_lockup_n(age)
  af_n <- get_ph_availability("N", ph)
  
  n_req <- (n_maint_total + n_export + n_lockup) / (fue_n * af_n)
  
  # 2. Potassium Budget
  k_export <- yield * CRITICAL_VALUES$removal_rates$K_per_tonne
  af_k <- 1.0 # K availability less pH dependent than P/Zn
  
  k_req <- k_export / (fue_k * af_k)
  
  # 3. Phosphorus Budget
  p_export <- yield * CRITICAL_VALUES$removal_rates$P_per_tonne
  af_p <- get_ph_availability("P", ph)
  
  p_req <- p_export / (fue_p * af_p)
  
  return(list(
    N_kg_ha = round(n_req, 2),
    K_kg_ha = round(k_req, 2),
    P_kg_ha = round(p_req, 2),
    post_harvest_n_min = round(n_req * 0.3, 2) # 30% Autumn mandate
  ))
}

# --- 5. Diagnostic & Alert Engine ---

#' Generate Nutritional Alerts
#' @param leaf_data List of nutrient concentrations (N, K, P, Zn, B)
#' @param env_data List containing temp, soil_moisture, ph
diagnose_orchard <- function(leaf_data, env_data) {
  alerts <- data.frame(priority = character(), message = character(), stringsAsFactors = FALSE)
  
  # A. Tissue Checks (Critical Values)
  for (nut in names(leaf_data)) {
    val <- leaf_data[[nut]]
    thresholds <- CRITICAL_VALUES$leaf[[nut]]
    
    if (val < thresholds["min"]) {
      alerts <- rbind(alerts, list(priority = "CRITICAL", message = paste("Low Leaf", nut, ": Yield collapse risk.")))
    } else if (val < thresholds["min"] * 1.1) {
      alerts <- rbind(alerts, list(priority = "WARNING", message = paste("Hidden Hunger (", nut, "): Approaching critical limit.")))
    }
  }
  
  # B. Environmental Checks
  if (env_data$temp > 38) {
    alerts <- rbind(alerts, list(priority = "CRITICAL", message = "Mass Flow Halt: Stomata closed. N/K uptake is zero. Sunburn risk high."))
  }
  
  if (env_data$ph > 7.5) {
    alerts <- rbind(alerts, list(priority = "WARNING", message = "Alkaline Lock-up: Prioritize foliar Zn/P programs."))
  }
  
  return(alerts)
}
