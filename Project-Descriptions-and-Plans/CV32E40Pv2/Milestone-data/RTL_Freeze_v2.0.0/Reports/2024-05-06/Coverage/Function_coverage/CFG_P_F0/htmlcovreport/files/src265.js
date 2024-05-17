var g_data = {"name":"/shark0/processing/cv32e40p/users/processing/PRODUCTS_DIGITAL_DESIGN/PANTHER/PANTHER_1.0/CV32/NR/CFG_P_F0/NR_QUESTA_INT_DEBUG_LONG/workdir/core-v-cores/cv32e40p/rtl/vendor/pulp_platform_fpnew/src/fpnew_top.sv","src":"// Copyright 2019 ETH Zurich and University of Bologna.\n//\n// Copyright and related rights are licensed under the Solderpad Hardware\n// License, Version 0.51 (the \"License\"); you may not use this file except in\n// compliance with the License. You may obtain a copy of the License at\n// http://solderpad.org/licenses/SHL-0.51. Unless required by applicable law\n// or agreed to in writing, software, hardware and materials distributed under\n// this License is distributed on an \"AS IS\" BASIS, WITHOUT WARRANTIES OR\n// CONDITIONS OF ANY KIND, either express or implied. See the License for the\n// specific language governing permissions and limitations under the License.\n//\n// SPDX-License-Identifier: SHL-0.51\n\n// Author: Stefan Mach <smach@iis.ee.ethz.ch>\n\nmodule fpnew_top #(\n  // FPU configuration\n  parameter fpnew_pkg::fpu_features_t       Features       = fpnew_pkg::RV64D_Xsflt,\n  parameter fpnew_pkg::fpu_implementation_t Implementation = fpnew_pkg::DEFAULT_NOREGS,\n  // PulpDivSqrt = 0 enables T-head-based DivSqrt unit. Supported only for FP32-only instances of Fpnew\n  parameter logic                           PulpDivsqrt    = 1'b1,\n  parameter type                            TagType        = logic,\n  parameter int unsigned                    TrueSIMDClass  = 0,\n  parameter int unsigned                    EnableSIMDMask = 0,\n  // Do not change\n  localparam int unsigned NumLanes     = fpnew_pkg::max_num_lanes(Features.Width, Features.FpFmtMask, Features.EnableVectors),\n  localparam type         MaskType     = logic [NumLanes-1:0],\n  localparam int unsigned WIDTH        = Features.Width,\n  localparam int unsigned NUM_OPERANDS = 3\n) (\n  input logic                               clk_i,\n  input logic                               rst_ni,\n  // Input signals\n  input logic [NUM_OPERANDS-1:0][WIDTH-1:0] operands_i,\n  input fpnew_pkg::roundmode_e              rnd_mode_i,\n  input fpnew_pkg::operation_e              op_i,\n  input logic                               op_mod_i,\n  input fpnew_pkg::fp_format_e              src_fmt_i,\n  input fpnew_pkg::fp_format_e              dst_fmt_i,\n  input fpnew_pkg::int_format_e             int_fmt_i,\n  input logic                               vectorial_op_i,\n  input TagType                             tag_i,\n  input MaskType                            simd_mask_i,\n  // Input Handshake\n  input  logic                              in_valid_i,\n  output logic                              in_ready_o,\n  input  logic                              flush_i,\n  // Output signals\n  output logic [WIDTH-1:0]                  result_o,\n  output fpnew_pkg::status_t                status_o,\n  output TagType                            tag_o,\n  // Output handshake\n  output logic                              out_valid_o,\n  input  logic                              out_ready_i,\n  // Indication of valid data in flight\n  output logic                              busy_o\n);\n\n  localparam int unsigned NUM_OPGROUPS = fpnew_pkg::NUM_OPGROUPS;\n  localparam int unsigned NUM_FORMATS  = fpnew_pkg::NUM_FP_FORMATS;\n\n  // ----------------\n  // Type Definition\n  // ----------------\n  typedef struct packed {\n    logic [WIDTH-1:0]   result;\n    fpnew_pkg::status_t status;\n    TagType             tag;\n  } output_t;\n\n  // Handshake signals for the blocks\n  logic [NUM_OPGROUPS-1:0] opgrp_in_ready, opgrp_out_valid, opgrp_out_ready, opgrp_ext, opgrp_busy;\n  output_t [NUM_OPGROUPS-1:0] opgrp_outputs;\n\n  logic [NUM_FORMATS-1:0][NUM_OPERANDS-1:0] is_boxed;\n\n  // -----------\n  // Input Side\n  // -----------\n  assign in_ready_o = in_valid_i & opgrp_in_ready[fpnew_pkg::get_opgroup(op_i)];\n\n  // NaN-boxing check\n  for (genvar fmt = 0; fmt < int'(NUM_FORMATS); fmt++) begin : gen_nanbox_check\n    localparam int unsigned FP_WIDTH = fpnew_pkg::fp_width(fpnew_pkg::fp_format_e'(fmt));\n    // NaN boxing is only generated if it's enabled and needed\n    if (Features.EnableNanBox && (FP_WIDTH < WIDTH)) begin : check\n      for (genvar op = 0; op < int'(NUM_OPERANDS); op++) begin : operands\n        assign is_boxed[fmt][op] = (!vectorial_op_i)\n                                   ? operands_i[op][WIDTH-1:FP_WIDTH] == '1\n                                   : 1'b1;\n      end\n    end else begin : no_check\n      assign is_boxed[fmt] = '1;\n    end\n  end\n\n  // Filter out the mask if not used\n  MaskType simd_mask;\n  assign simd_mask = simd_mask_i | ~{NumLanes{logic'(EnableSIMDMask)}};\n\n  // -------------------------\n  // Generate Operation Blocks\n  // -------------------------\n  for (genvar opgrp = 0; opgrp < int'(NUM_OPGROUPS); opgrp++) begin : gen_operation_groups\n    localparam int unsigned NUM_OPS = fpnew_pkg::num_operands(fpnew_pkg::opgroup_e'(opgrp));\n\n    logic in_valid;\n    logic [NUM_FORMATS-1:0][NUM_OPS-1:0] input_boxed;\n\n    assign in_valid = in_valid_i & (fpnew_pkg::get_opgroup(op_i) == fpnew_pkg::opgroup_e'(opgrp));\n\n    // slice out input boxing\n    always_comb begin : slice_inputs\n      for (int unsigned fmt = 0; fmt < NUM_FORMATS; fmt++)\n        input_boxed[fmt] = is_boxed[fmt][NUM_OPS-1:0];\n    end\n\n    fpnew_opgroup_block #(\n      .OpGroup       ( fpnew_pkg::opgroup_e'(opgrp)    ),\n      .Width         ( WIDTH                           ),\n      .EnableVectors ( Features.EnableVectors          ),\n      .PulpDivsqrt   ( PulpDivsqrt                     ),\n      .FpFmtMask     ( Features.FpFmtMask              ),\n      .IntFmtMask    ( Features.IntFmtMask             ),\n      .FmtPipeRegs   ( Implementation.PipeRegs[opgrp]  ),\n      .FmtUnitTypes  ( Implementation.UnitTypes[opgrp] ),\n      .PipeConfig    ( Implementation.PipeConfig       ),\n      .TagType       ( TagType                         ),\n      .TrueSIMDClass ( TrueSIMDClass                   )\n    ) i_opgroup_block (\n      .clk_i,\n      .rst_ni,\n      .operands_i      ( operands_i[NUM_OPS-1:0] ),\n      .is_boxed_i      ( input_boxed             ),\n      .rnd_mode_i,\n      .op_i,\n      .op_mod_i,\n      .src_fmt_i,\n      .dst_fmt_i,\n      .int_fmt_i,\n      .vectorial_op_i,\n      .tag_i,\n      .simd_mask_i     ( simd_mask             ),\n      .in_valid_i      ( in_valid              ),\n      .in_ready_o      ( opgrp_in_ready[opgrp] ),\n      .flush_i,\n      .result_o        ( opgrp_outputs[opgrp].result ),\n      .status_o        ( opgrp_outputs[opgrp].status ),\n      .extension_bit_o ( opgrp_ext[opgrp]            ),\n      .tag_o           ( opgrp_outputs[opgrp].tag    ),\n      .out_valid_o     ( opgrp_out_valid[opgrp]      ),\n      .out_ready_i     ( opgrp_out_ready[opgrp]      ),\n      .busy_o          ( opgrp_busy[opgrp]           )\n    );\n  end\n\n  // ------------------\n  // Arbitrate Outputs\n  // ------------------\n  output_t arbiter_output;\n\n  // Round-Robin arbiter to decide which result to use\n  rr_arb_tree #(\n    .NumIn     ( NUM_OPGROUPS ),\n    .DataType  ( output_t     ),\n    .AxiVldRdy ( 1'b1         )\n  ) i_arbiter (\n    .clk_i,\n    .rst_ni,\n    .flush_i,\n    .rr_i   ( '0             ),\n    .req_i  ( opgrp_out_valid ),\n    .gnt_o  ( opgrp_out_ready ),\n    .data_i ( opgrp_outputs   ),\n    .gnt_i  ( out_ready_i     ),\n    .req_o  ( out_valid_o     ),\n    .data_o ( arbiter_output  ),\n    .idx_o  ( /* unused */    )\n  );\n\n  // Unpack output\n  assign result_o        = arbiter_output.result;\n  assign status_o        = arbiter_output.status;\n  assign tag_o           = arbiter_output.tag;\n\n  assign busy_o = (| opgrp_busy);\n\nendmodule\n","lang":"verilog"};
processSrcData(g_data);